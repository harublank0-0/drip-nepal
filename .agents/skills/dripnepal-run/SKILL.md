---
name: dripnepal-run
description: Starts the DripNepal app with demo data and checks pages in headless Chromium at phone and desktop widths, in the light and dark themes, using a bundled script that screenshots each page and reports console, hydration, CSP and request errors. Use whenever you need to see a change working in the real app, take or compare screenshots, check a page at 390px, log in as the demo vendor or admin, check the production build (SSR, CSP, no devtools), or reproduce a storefront or seller-dashboard bug. Use it even when the user only asks "does it look right?", "check it on mobile" or "did that break anything?".
---

# Running DripNepal

How to start the app with realistic data and look at it the way a customer or seller would. Tests (the `dripnepal-testing` skill) prove behaviour; this skill shows what a person sees. `docs/08-ui-ux-and-design-system.md` owns how pages should look, and wins over any opinion here.

## 1. Database and environment

The app uses the same PostgreSQL as the tests. If `pg_isready -h localhost` doesn't answer, follow steps 1 and 2 of the `dripnepal-testing` skill (`pnpm install`; Docker on a laptop or the PostgreSQL cluster tools in a cloud session; then `.env` with an `APP_KEY`). The development database is `dripnepal`, the `DB_DATABASE` in `.env`. Docker Compose creates it; without Docker, create it once (an "already exists" error means it is there):

```bash
psql -h localhost -U postgres -c "create database dripnepal owner dripnepal encoding 'UTF8' template template0"
```

## 2. Schema and demo data

```bash
node ace migration:run --no-schema-generate
node ace db:seed
```

- `--no-schema-generate` stops `migration:run` from rewriting `database/schema.ts`, a generated file whose output depends on the database it ran against. Leave it off only when you changed a migration and mean to commit the regenerated file.
- In development, `db:seed` runs the reference seeders plus the demo data: 3 active shops and 1 pending shop, 24 products, and 12 orders covering every status (including a guest order). It is safe to run again.
- Development logs every SQL query, so the output is long. Each seeder ends with a `❯ completed …` line; `node ace db:seed 2>&1 | grep ❯` shows just those.

Demo logins (development only, password `dripnepal`):

| Who       | Email                                                                                       | Notes                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Vendor    | `demo@dripnepal.com`                                                                        | Owns `thamel-threads`, `patan-handloom` and `pokhara-supply` (active) and `bhaktapur-crafts` (pending) |
| Admin     | `admin@dripnepal.com`                                                                       | `/admin/shops` approves, rejects and suspends shops                                                    |
| Customers | `aarav@dev.dripnepal.invalid`, `sita@dev.dripnepal.invalid`, `bikash@dev.dripnepal.invalid` | Saved addresses and past orders                                                                        |

Demo product photos are remote `images.unsplash.com` URLs. A cloud session's network policy usually blocks that host, so photos appear as broken images there. That is the environment, not the change you are checking.

## 3. Start the app

**Development** (hot reload, `http://localhost:3333`). Run it in the background and wait until it answers:

```bash
pnpm dev
curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-connrefused http://localhost:3333/health/live
```

**Production build.** Use it whenever the change touches server rendering, the Content-Security-Policy, hydration, or anything fixed to the bottom of the screen: development mode adds a TanStack devtools badge in the bottom-right corner that covers buttons there, and it doesn't enforce the CSP.

```bash
node ace build
cp .env build/.env
cd build && NODE_ENV=production PORT=3334 APP_URL=http://localhost:3334 node bin/server.js
```

The build uses the repository's `node_modules`, so no second install is needed. `curl -sI http://localhost:3334/ | grep -i content-security-policy` confirms the CSP is on.

## 4. Check pages

The bundled script visits each path at 390 px and 1280 px, in the light and dark themes, saves screenshots to `tmp/page-checks/` (gitignored), and prints one line per page:

```bash
node .agents/skills/dripnepal-run/scripts/check_pages.cjs / /men /products/heavyweight-oversized-hoodie-thamel /track-order
node .agents/skills/dripnepal-run/scripts/check_pages.cjs --login demo@dripnepal.com:dripnepal \
  /shops/thamel-threads/dashboard /shops/thamel-threads/orders
node .agents/skills/dripnepal-run/scripts/check_pages.cjs --base http://localhost:3334 /   # the production build
```

Options: `--widths 390,768,1280`, `--themes light`, `--full` (whole page, not just the first screen), `--scale 2` (sharper screenshots for a person to look at), `--out <dir>`. It exits 1 when any page fails.

What a line means:

- **`FAIL` with `HTTP 4xx/5xx`**: the page itself failed. Check the path with `node ace list:routes` (it prints JSON, one route per line).
- **`console:` or `page error:`**: a JavaScript error, a hydration mismatch, or a CSP violation. These are real bugs; the production build is where CSP and hydration problems show reliably.
- **`request:`**: one of the app's own requests failed, or a request was blocked by the CSP.
- **`page scrolls sideways at this width`**: something is wider than the screen. To find it, list the elements whose right edge passes `window.innerWidth` and whose parent's doesn't, in a short Playwright snippet.
- **`external requests failed (not counted)`**: other hosts, usually the blocked demo photos. They don't fail the run.

The script catches errors, not ugliness. **Look at the screenshots** (open the PNG files) for layout, contrast and spacing, compare with docs/08, and check both themes: the default theme when nothing is saved is dark, and a page that only looks right in one theme is a bug.

The script loads Playwright from `require('playwright')` (pre-installed in Claude Code cloud sessions), falling back to the copy pnpm installs for `@japa/browser-client`. If neither has a browser, it says how to install one.

## 5. Report what you checked

Say which pages, widths, themes and mode (development or production build) you checked, paste the result lines, and name what you couldn't check, such as photos blocked by the network. The pull requests in this repository list evidence that way; a reviewer trusts "checked at 390 and 1280 in both themes on the production build, 0 console errors" more than "looks good".

## 6. Stop

Stop the servers you started (`pnpm dev`, `node bin/server.js`). `build/` and `tmp/` are gitignored; `git status` should show only your own changes.
