#!/bin/sh
# T-OPS-010 (docs/11 §4.2): checks on the production image.
#   1. it runs as a non-root user;
#   2. it holds no .env* file;
#   3. the SSR bundle is present;
#   4. it boots: /health/live answers 200 with the image's release, and
#      /health/ready answers 503 because no database is reachable.
# Usage: scripts/check_image.sh <image>
set -eu

IMAGE="$1"
NAME="dripnepal-image-check-$$"
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT

fail() {
  echo "T-OPS-010: $1" >&2
  docker logs "$NAME" 2>&1 | tail -40 >&2 || true
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
}

uid=$(docker run --rm --entrypoint id "$IMAGE" -u)
[ "$uid" != "0" ] || fail "the image runs as root"

envfiles=$(docker run --rm --entrypoint find "$IMAGE" /app -name '.env*')
[ -z "$envfiles" ] || fail "the image contains env files: $envfiles"

docker run --rm --entrypoint test "$IMAGE" -f /app/ssr/ssr.js || fail "the SSR bundle /app/ssr/ssr.js is missing"

# A staging-shaped environment with throwaway keys; nothing listens on DB_HOST.
key() { openssl rand -base64 32; }
docker run -d --name "$NAME" -p 127.0.0.1:3399:3333 \
  -e RUN_MIGRATIONS=false \
  -e APP_ENV=staging -e TZ=UTC -e LOG_LEVEL=info -e APP_NAME=dripnepal \
  -e APP_KEY="$(openssl rand -base64 48)" -e APP_URL=https://staging.dripnepal.test \
  -e SESSION_DRIVER=database -e LIMITER_STORE=database -e DRIVE_DISK=fs \
  -e DB_HOST=127.0.0.1 -e DB_PORT=5432 -e DB_USER=dripnepal_app -e DB_PASSWORD=unused \
  -e DB_DATABASE=dripnepal -e DB_SSL=false -e DB_POOL_MAX=2 \
  -e DATA_ENCRYPTION_KEYS="k1:$(key)" -e DATA_ENCRYPTION_ACTIVE_KEY_ID=k1 \
  -e BLIND_INDEX_KEY="$(key)" -e HMAC_KEY_LIMITER="$(key)" \
  -e HMAC_KEY_AUDIT_IP="$(key)" -e HMAC_KEY_NOTIFY_ADDRESS="$(key)" \
  "$IMAGE" >/dev/null

live=""
for _ in $(seq 1 30); do
  live=$(curl -fsS http://127.0.0.1:3399/health/live 2>/dev/null) && break
  sleep 1
done
[ -n "$live" ] || fail "the server did not answer /health/live within 30 s"
release=$(docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$IMAGE" | sed -n 's/^APP_RELEASE=//p')
echo "$live" | grep -q "\"release\":\"$release\"" || fail "/health/live does not report the release $release: $live"

ready=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3399/health/ready)
[ "$ready" = "503" ] || fail "/health/ready answered $ready without a database"

docker rm -f "$NAME" >/dev/null
echo "T-OPS-010: image checks passed (uid $uid, release $release)"
