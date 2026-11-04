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
git tag --sort=-v:refname | head -3    # the newest releases
git checkout v1.0.0                    # the release to deploy
cp .env.production.example .env.production
```

The server runs a release tag, never the tip of `main`, so a pull request merged but not yet released never reaches customers (see [Releasing](#releasing)).

Edit `.env.production`:

- `DOMAIN` and `APP_URL`: your domain, with `https://` in `APP_URL`.
- `DB_PASSWORD`: a long random password. `openssl rand -base64 32` makes one.
- `APP_KEY`: generate it once the image is built (step 3).
- `APP_RELEASE`: the tag you checked out, such as `v1.0.0`. `/health/live` reports it, so you can see which release is running.
- `SUPPORT_PHONE`, `SUPPORT_EMAIL`: how customers reach you. The phone number also becomes a WhatsApp link. They appear in the footer, on order pages, on the policy pages and behind "Forgot password?" on the login page, which is how customers get a password reset until email is added. Each is optional, but set at least one.
- `INSTAGRAM_URL`, `FACEBOOK_URL`, `TIKTOK_URL`: optional links shown in the footer.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`: the mail server for new-order emails (see [Email](#email)). Left empty, no email is sent.

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

## Email

When an order arrives, the app emails the shop: one email per order, to the shop owner's login email and to the shop's contact email if that is different. It names the order, the items and the total, and links to the order in the dashboard. It leaves out the customer's name, phone and address; those stay in the dashboard.

In the dashboard, the bell in the top bar shows how many orders wait for you to confirm them. Its menu turns on a sound and a desktop notification for new orders in that browser. The bell works without email.

Any SMTP server can send the emails. Fill in these lines of `.env.production` and run the `up -d` command again.

**Gmail, to start.** Turn on 2-Step Verification for the Google account, then create an app password for it. Google's help pages have the current steps.

```dotenv
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USERNAME=you@gmail.com
SMTP_PASSWORD=the-app-password
MAIL_FROM="Drip Nepal <you@gmail.com>"
```

Gmail sends from the account's own address and limits how many emails a day it sends. That is enough for order emails to yourself.

**A mail provider, later.** Which provider to use (Resend, Brevo, Amazon SES or another) is still open (OD-08 in [docs/risks-and-open-decisions.md](docs/risks-and-open-decisions.md)). Each one offers SMTP: copy the host, port, user name and password from the provider's SMTP settings into the same lines. Set `MAIL_FROM` to an address on your own domain once the provider has verified that domain. No code changes.

**Check that it works.** Place a test order on the storefront, then cancel it in the dashboard. The email should arrive within a minute. If it doesn't, look in the logs:

```bash
docker compose -f docker-compose.prod.yml logs app | grep "New-order email"
```

Each failed attempt logs the order number and an error code: `EAUTH` means a wrong user name or password, and `ESOCKET`, `ECONNECTION` or `ETIMEDOUT` mean the server couldn't be reached. Some VPS providers block outgoing mail ports on new accounts, so if every attempt is a connection error, ask your provider. The app tries three times over two minutes, then gives up. An email still waiting for a retry is lost if the app restarts in that time. The order is safe either way, and the bell still counts it.

To turn email off, leave `SMTP_HOST` empty. The log then says once that new-order emails are off.

## Releasing

Production deploys from `main`, by release tag (decision of 2026-11-04 in [docs/risks-and-open-decisions.md §2.3](docs/risks-and-open-decisions.md#23-decision-log)).

1. Changes reach `main` only through pull requests with green CI.
2. When `main` holds what you want to ship, tag that commit and push the tag:

   ```bash
   git checkout main && git pull
   git tag -a v1.0.1 -m "Dashboard fits on phones"
   git push origin v1.0.1
   ```

   Raise the last number for fixes (`v1.0.1`) and the middle one for new features (`v1.1.0`).

3. Deploy the tag on the server (next section).

## Updating

```bash
git fetch --tags
git checkout v1.0.1
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

Set `APP_RELEASE` in `.env.production` to the same tag before the `up` command. Migrations run automatically when the new container starts.

To roll back, check out the previous tag and run the same `up` command. Rolling back the code does not undo a migration, so take a database backup (next section) before deploying a release that adds one.

## One-time steps after a release

Some releases need a command run once after deploying them. Take a backup first (next section).

- **The release that adds photo resizing.** Photos uploaded earlier are still the full-size originals, with any GPS location the phone saved. Convert them to the resized WebP files and delete the originals:

  ```bash
  docker compose -f docker-compose.prod.yml --env-file .env.production exec app \
    node ace media:optimize
  ```

  It prints how many photos it converted and lists any it couldn't, which are left as they were. Running it again is safe: converted photos are skipped. New uploads are resized as they come in, so you never need to run it again.

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
