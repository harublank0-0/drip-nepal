---
name: dripnepal-run
description: Starts the DripNepal app on the E4 baseline and checks its pages in headless Chromium at phone and desktop widths, in the light and dark themes, using a bundled script that screenshots each page and reports console, hydration, CSP and request errors. Use whenever you need to see a change working in the real app, take or compare screenshots, check a page at 390px, check the health endpoints, or check that the production build starts. Use it even when the user only asks "does it look right?", "check it on mobile" or "did that break anything?".
---

# Running DripNepal

How to start the app and look at it the way a person would. Tests (the `dripnepal-testing` skill) prove behaviour; this skill shows what a person sees. `docs/08-ui-ux-and-design-system.md` owns how pages should look, and wins over any opinion here.

## What there is to see today

The v1 store (storefront, seller dashboard, admin pages, demo logins) was removed with the E4 schema baseline. Until the flows of M1 to M7 are rebuilt ([docs/12](../../../docs/12-roadmap-and-backlog.md)), the app serves:

| Path                 | Where            | What                                                                                                                                |
| -------------------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/dev/design-system` | development only | The theme tokens, buttons and cards: the one Inertia page                                                                           |
| `/health/live`       | every mode       | `{"status":"ok","release":…}`: the process serves HTTP ([docs/11 §7.1](../../../docs/11-deployment-and-operations.md#71-endpoints)) |
| `/health/ready`      | every mode       | `{"status":"ok"}`, or 503 when the database does not answer                                                                         |
| `/uploads/*`         | every mode       | Files in `./storage`, served by the `fs` disk of `config/drive.ts`; nothing uploads yet                                             |
| anything else        | every mode       | 404: the server-rendered error page (`errors/not_found`), or a problem+json body under `/api/`                                      |

There is no demo data and no login: OD-59 (decided 2026-11-21) puts no demo seeder in M0, and the one a later milestone builds needs the actions of M1 to M6, and the first platform admin comes from `node ace platform:create-admin`, which E8 builds. `node ace list:routes` lists the routes that exist (one JSON line per route in a non-interactive shell, a table in a terminal).

## 1. Database and environment

The app uses the same PostgreSQL as the tests. In a fresh checkout, do steps 1 and 2 of the `dripnepal-testing` skill first: `pnpm install`, a running PostgreSQL (Docker on a laptop, the cluster tools in a cloud session) with the three roles, and `.env` with an `APP_KEY`. A running server is not enough on its own: also check that the development database exists, because a server set up for tests may only have `dripnepal_test`:

```bash
psql -h localhost -U postgres -lqt | cut -d'|' -f1 | grep -qw dripnepal_dev && echo "dripnepal_dev exists"
```

The development database is `dripnepal_dev`, the `DB_DATABASE` in `.env`. Docker Compose creates it; without Docker, create it once, and on PostgreSQL older than 18 give it the local `uuidv7()` that step 1 of the `dripnepal-testing` skill describes, connected as `dripnepal`:

```bash
psql -h localhost -U postgres -c "create database dripnepal_dev owner dripnepal encoding 'UTF8' template template0"
```

To keep a second checkout's data apart, give one command or server another database, such as `DB_DATABASE=dripnepal_feature_dev node ace …`: a variable set in the shell wins over `.env`.

## 2. Schema and reference data

```bash
node ace migration:run --no-schema-generate
node ace jobs:install
node ace db:seed
```

- `--no-schema-generate` stops `migration:run` from rewriting `database/schema.ts`, a generated file whose output depends on the database it ran against. Leave it off only when you changed a migration and mean to commit the regenerated file.
- `db:seed` runs the reference seeders `02_` to `09_` of `database/seeders/reference/` (delivery zones, shop categories, categories, attributes, brands, settings, the `ncm` courier; no locations yet). `database/seeders/dev/` does not exist yet. Running it again is safe.
- Development logs every SQL query, so the output is long. Each seeder ends with a `❯ completed …` line; `node ace db:seed 2>&1 | grep ❯` shows just those.

## 3. Start the app

**Development** (hot reload, `http://localhost:3333`). Run it in the background and wait until it answers:

```bash
pnpm dev
curl -s -o /dev/null --retry 60 --retry-delay 1 --retry-connrefused http://localhost:3333/health/live
curl -s http://localhost:3333/health/ready
```

If another checkout's server already holds the port, start this one with `PORT=3340 pnpm dev` and pass `--base http://localhost:3340` to the script below.

**Production build.** It serves no page yet (`/dev/design-system` is development-only), so use it to check that the build compiles, starts and answers the health endpoints:

```bash
node ace build
test -f build/public/assets/server/.vite/manifest.json && echo "SSR bundle built"
cp .env build/.env
cd build && NODE_ENV=production PORT=3334 APP_URL=http://localhost:3334 node bin/server.js
curl -s http://localhost:3334/health/live
```

The build uses the repository's `node_modules`, so no second install is needed. Once a production page exists again, check it here as well: development mode adds a TanStack devtools badge in the bottom-right corner that covers buttons there and doesn't enforce the Content-Security-Policy, so hydration and CSP problems show reliably only in the build.

## 4. Check pages

The bundled script visits each path at 390 px and 1280 px, in the light and dark themes, saves screenshots to `tmp/page-checks/` (gitignored), and prints one line per page. With no path it checks `/dev/design-system`:

```bash
node .agents/skills/dripnepal-run/scripts/check_pages.cjs
node .agents/skills/dripnepal-run/scripts/check_pages.cjs --widths 390 --full --scale 2 /dev/design-system
```

Options: `--base <url>` (another server), `--widths 390,768,1280`, `--themes light`, `--full` (the whole page, clipped to the screen width so it shows what a phone shows), `--scale 2` (sharper screenshots for a person to look at), `--out <dir>`. `--login email:password` fills the login form at `/auth/login` before the visits; no login page exists until M1, so check the form's path and field names when one does. It exits 1 when any page fails.

What a line means:

- **`FAIL` with `HTTP 4xx/5xx`**: the page itself failed. Check the path with `node ace list:routes`.
- **`console:` or `page error:`**: a JavaScript error, a hydration mismatch, or a CSP violation. These are real bugs; the production build is where CSP and hydration problems show reliably.
- **`request:`**: one of the app's own requests failed, or a request was blocked by the CSP.
- **`page scrolls sideways at this width (630px wide)`**: something is wider than the screen. The `wide:` lines under it name the element and the usual fix. The three causes found in this codebase so far:
  - a **flex item with `min-width: auto`** grows to its widest child (a table, a long row) instead of the screen: add `min-w-0`;
  - a **grid with no explicit columns** at phone width has an automatic track that grows to its content: add `grid-cols-1`;
  - an **absolutely positioned child**, often an `sr-only` label, escapes an `overflow-x-auto` box that isn't positioned: make the box `relative`.

  Fix the first cause listed and run the check again: an outer cause can hide an inner one.

- **`external requests failed (not counted)`**: other hosts, such as fonts a cloud session's network policy blocks. They don't fail the run.

The script catches errors, not ugliness. **Look at the screenshots** (open the PNG files) for layout, contrast and spacing, compare with docs/08, and check both themes: the default theme when no `dn_theme` cookie is set is light (docs/08 §1.2), and a page that only looks right in one theme is a bug.

The script loads Playwright from `require('playwright')` (pre-installed in Claude Code cloud sessions), falling back to the copy pnpm installs for `@japa/browser-client`. If neither has a browser, it says how to install one.

## 5. Report what you checked

Say which pages, widths, themes and mode (development or production build) you checked, paste the result lines, and name what you couldn't check, such as fonts blocked by the network. The pull requests in this repository list evidence that way; a reviewer trusts "checked at 390 and 1280 in both themes, 0 console errors" more than "looks good".

## 6. Stop

Stop the servers you started (`pnpm dev`, `node bin/server.js`) by their process IDs, not by a name pattern that could match another checkout's server. `pnpm dev` runs three processes (a shell, `node ace serve` and the server it watches); stop all three, and check with `curl` that the port no longer answers. `build/` and `tmp/` are gitignored, so `git status` should show only your own changes, with one exception. Running the app can rewrite generated files under `.adonisjs/` (the route registries, reordered) or leave an untracked `.adonisjs/server/routes.json`. They are generated ([09 §1.4](../../../docs/09-code-structure-and-engineering-standards.md#14-generated-artefacts)): restore them with `git checkout -- .adonisjs` and delete the untracked file, unless your change is meant to alter them.
