# Deploying Drip Nepal to a VPS

One server runs three containers from `docker-compose.prod.yml`:

- **app**: the AdonisJS server. It runs pending migrations on start.
- **postgres**: the database, stored in the `pgdata` volume.
- **caddy**: the reverse proxy. It gets and renews HTTPS certificates.

Product photos live in the `uploads` volume.

A 2 GB / 1 vCPU VPS is enough to start. Pick a region close to Nepal, such as Singapore or Mumbai.

## 1. Prepare the server

```bash
# Ubuntu 24.04 example
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # log out and back in
```

Point your domain's **A record** at the server's IP. Open ports 80 and 443.

## 2. Configure

```bash
git clone <repo-url> drip-nepal && cd drip-nepal
cp .env.production.example .env.production
```

Edit `.env.production`:

- `DOMAIN` and `APP_URL`: your domain, with `https://` in `APP_URL`.
- `DB_PASSWORD`: a long random password. `openssl rand -base64 32` makes one.
- `APP_KEY`: generate it once the image is built (step 3).

## 3. Build and start

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production build

# Generate APP_KEY and paste it into .env.production
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --no-deps --entrypoint "" app node ace generate:key --show

docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

The first start runs every migration. Seed the reference data once: categories, shop categories, size/color attributes and roles.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec app \
  node ace db:seed --files=database/seeders/category_seeder.js \
  --files=database/seeders/shop_category_seeder.js \
  --files=database/seeders/attribute_seeder.js \
  --files=database/seeders/global_role_seeder.js
```

The demo catalog seeder only runs in development and test, so it never touches production.

## 4. Create the admin

Sign up on the site with the admin's email, then grant the admin role:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec \
  -e ADMIN_EMAIL=you@example.com app \
  node ace db:seed --files=database/seeders/admin_seeder.js
```

The admin approves new shops at `/admin/shops`. A shop's products appear on the storefront only after it's approved.

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Migrations run automatically when the new container starts.

## Backups

Back up both the database and the photos. Run this daily, for example from cron:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U dripnepal -Fc dripnepal > backups/db-$(date +%F).dump

docker run --rm -v drip-nepal_uploads:/data -v "$PWD/backups":/backup alpine \
  tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Copy `backups/` off the server, for example to object storage or another machine. To restore the database: `pg_restore -U dripnepal -d dripnepal --clean <file>`.

## Logs

```bash
docker compose -f docker-compose.prod.yml logs -f app
```
