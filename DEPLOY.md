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
- `SUPPORT_PHONE`, `SUPPORT_EMAIL`: how customers reach you. The phone number also becomes a WhatsApp link. They appear in the footer, on order pages, on the policy pages and behind "Forgot password?" on the login page, which is how customers get a password reset until email is added. Each is optional, but set at least one.
- `INSTAGRAM_URL`, `FACEBOOK_URL`, `TIKTOK_URL`: optional links shown in the footer.

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

## 4. Set up your shop and the admin

v1 has one seller, so shop registration is closed by default. Open it once to register your own shop.

1. In `.env.production`, set `SHOP_REGISTRATION_OPEN=true`. Then restart the app:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d
   ```

2. Open `https://<your domain>/auth/shop/register` and register your shop. This creates your account and the shop, which starts as pending.

3. Give your account the admin role:

   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production exec \
     -e ADMIN_EMAIL=you@example.com app \
     node ace db:seed --files=database/seeders/admin_seeder.js
   ```

4. Log in, open `/admin/shops` and approve your shop. Its products appear on the storefront only once it's approved.

5. Set `SHOP_REGISTRATION_OPEN=false` (or remove the line) and run the `up -d` command again. The register page and API now answer 404, and the storefront hides the "open a shop" links.

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
