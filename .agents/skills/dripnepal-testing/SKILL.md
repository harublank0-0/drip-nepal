---
name: dripnepal-testing
description: Runs and writes DripNepal's automated tests (Japa unit, functional and concurrency suites on PostgreSQL). Use whenever you add or change server behaviour, write, fix or run a test, need a test database (on a laptop with Docker or in a cloud session without it), see a failing `pnpm test` or a red "Tests" job in CI, or need to prove that a lock, race or double submit is handled. Use it even when the user only says "make sure this works", "add coverage" or "is checkout safe?".
---

# DripNepal testing

How to get a test database, run the suites, and write tests that prove something. `docs/10-testing-and-quality-gates.md` owns the test strategy, the test ID registry (§6) and the CI gates (§5); this skill is the hands-on part. Read the owner when you need a rule's reasoning.

## What is already here

| Piece          | Where                                                                               | What it does                                                                                                                                                                                                                                                                                                                |
| -------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suites         | `adonisrc.ts`                                                                       | `unit` (no database), `functional` (database, each test rolled back), `concurrency` (database, real commits), `browser` (configured, no specs yet)                                                                                                                                                                          |
| Database setup | `tests/support/database.ts`, called from `configureSuite` in `tests/bootstrap.ts`   | Once per run, as `dripnepal_migrator` on the `pg_migrator` connection: `db:wipe`, `migration:run --no-schema-generate`, `DROP SCHEMA pgboss` and `jobs:install` (the pg-boss schema and its grants), then `db:seed` with the reference seeder files (`database/seeders/reference/`). The suites then run as `dripnepal_app` |
| Isolation      | `tests/bootstrap.ts`                                                                | Every `functional` test runs inside a global transaction that is rolled back; service `db.transaction()` calls become savepoints. `concurrency` tests commit for real                                                                                                                                                       |
| Fixtures       | `tests/support/schema_rows.ts`                                                      | Row builders for the schema tests (`insertUser`, `insertShop`, `insertOrder`, `insertShopOrder`, …) and `refused()`, which runs a write in a savepoint and asserts the SQLSTATE and constraint                                                                                                                              |
| Factories      | `database/factories/`                                                               | `UserFactory`, `ShopFactory` (`.apply('active')` adds the agreement), `ProductFactory` (default variant and stock row; needs the seeded `t-shirts`). `FACTORY_PASSWORD` is the run's random password                                                                                                                        |
| Examples       | `tests/functional/schema/*.spec.ts`, `tests/concurrency/schema/append_only.spec.ts` | Constraint tests of the baseline tables; the append-only tables under both roles                                                                                                                                                                                                                                            |
| S3 server      | `docker compose up -d seaweedfs` (OD-65)                                            | `T-MED-005` runs the S3 adapter against it; without a server on `S3_CONTRACT_ENDPOINT` (default `http://127.0.0.1:8333`) it is skipped, and with `S3_CONTRACT_REQUIRED=1`, as in CI, a missing server fails it. Every other test binds the in-memory fake of `tests/support/object_storage.ts` (`.env.test` blanks `S3_*`)  |
| Safety guard   | `start/env_policy.ts`                                                               | Under `NODE_ENV=test`, boot refuses any `DB_DATABASE` that doesn't end in `_test`, so a test run can only ever wipe a test database                                                                                                                                                                                         |

## 1. Get a database

A fresh checkout has no `node_modules`: run `pnpm install` first (pnpm 11; `package.json` enforces it).

Check first: `pg_isready -h localhost`. If it answers, skip to step 2.

Tests use two database roles, as production does (docs/10 §3.2, docs/07 §4.10): the run setup migrates as `dripnepal_migrator`, which owns the test database, and the tests connect as `dripnepal_app`, which has no `UPDATE` or `DELETE` on the append-only tables. A third role, `dripnepal_readonly`, receives the incident-read grants. All three must exist before the first run.

**With Docker (a developer laptop):** `docker compose up -d`. Check for a running daemon with `docker info`, not `which docker`: a cloud session can have the command without the daemon. The init scripts in `docker/postgres/init/` create the three roles and `dripnepal_test`, owned by the migrator, on a fresh volume. On an older volume, run the three commands in the header of `docker/postgres/init/00_create_roles.sql` once: they create the roles, then drop and recreate `dripnepal_test` owned by the migrator. A volume made before 2026-11-20 also lacks `dripnepal_dev`, the development database `.env.example` now names: recreate it once with `docker compose down -v` (this deletes local data), then `docker compose up -d`. Compose needs `DB_PASSWORD` in `.env`.

**Without Docker (a Claude Code cloud session):** there is no Docker daemon, but the image (Ubuntu) has PostgreSQL server packages with Debian's cluster tools. Run these one at a time; each is safe to repeat:

```bash
pg_lsclusters
pg_createcluster 16 driptest -p 5432 -e UTF8 --locale C.UTF-8 -- --auth=trust
pg_ctlcluster 16 driptest start
psql -h localhost -U postgres -c "create role dripnepal login password 'secret' superuser"
psql -h localhost -U postgres -f docker/postgres/init/00_create_roles.sql
psql -h localhost -U postgres -c "create database dripnepal_test owner dripnepal_migrator encoding 'UTF8' template template0"
```

- Use the newest version `pg_lsclusters` or `ls /usr/lib/postgresql` shows in place of `16`. If `pg_lsclusters` already lists `driptest`, skip `pg_createcluster`; "already exists" errors from the `psql` lines are fine.
- A `dripnepal_test` that was migrated before the roles existed keeps the baseline functions (`set_updated_at` and the others) owned by its old owner, and the migrator cannot `CREATE OR REPLACE` them, so the first run fails in baseline file 1. Drop and recreate it once: `psql -h localhost -U postgres -c "drop database dripnepal_test"`, then the `create database` line above. Handing over ownership with `alter database` is enough only for a database that was never migrated.
- On PostgreSQL older than 18 the baseline needs a `uuidv7()` function, which 18 has built in. Create it in the test database as the migrator (`psql -h localhost -U dripnepal_migrator -d dripnepal_test`); it is local only and never committed to a migration. `db:wipe` drops tables, not functions, so it survives each run. This stand-in writes the millisecond time into the first 48 bits and sets the version bits to 7:

  ```sql
  CREATE OR REPLACE FUNCTION public.uuidv7() RETURNS uuid LANGUAGE sql AS $f$
    SELECT encode(set_bit(set_bit(overlay(uuid_send(gen_random_uuid())
      PLACING substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
      FROM 1 FOR 6), 52, 1), 53, 1), 'hex')::uuid
  $f$;
  ```

- Spell out UTF8. Without a locale in the environment, the server picks `SQL_ASCII`, which accepts invalid text that CI's UTF8 database rejects, so Nepali product text would behave differently.
- Another cluster (usually `16/main`, stopped) may also be set to port 5432. Leave it stopped.
- A restart of the session's worker stops the server; `pg_ctlcluster 16 driptest start` brings it back with its data.

Production and CI run PostgreSQL 18.4. An older local server (16 is common) runs the current migrations, but say which version you ran on when you report results, because CI is the first run on 18.4.

## 2. Environment

`.env` is gitignored, so a fresh clone has none. Create it and give it a key:

```bash
cp .env.example .env
node ace generate:key --show
```

Paste the printed key after `APP_KEY=` in `.env`. Plain `node ace generate:key` would write it for you, but it also rewrites `.env.example`, which you'd then have to restore.

An `.env` copied before 2026-11-11 lacks the variables E6 added (`APP_ENV`, `APP_NAME`, `DB_SSL`, `DB_POOL_MAX` and the keys); boot fails with a list of them, and `.env.example` has a development value for each.

`.env.test` (committed) switches to `NODE_ENV=test` and `APP_ENV=test`, the production session and limiter stores (`SESSION_DRIVER=database`, `LIMITER_STORE=database`) and `DB_DATABASE=dripnepal_test`, sets `LOG_LEVEL=warn`, a fixed `APP_KEY` and placeholder keys, connects as `DB_USER=dripnepal_app`, and sets `DB_MIGRATOR_USER` and `DB_MIGRATOR_PASSWORD` for the `pg_migrator` connection, which exists only under `NODE_ENV=test`. `DB_PASSWORD` comes from `.env`; all three roles use the docker-compose password. CI has no `.env`: the "Tests" job in `.github/workflows/ci.yml` creates the roles in a step and sets the same variables in its `env:` block.

To regenerate `database/schema.ts` after a migration change, migrate as the migrator: `NODE_ENV=test node ace migration:fresh --connection=pg_migrator`, then `pnpm exec prettier --write database/schema.ts` (this is the `T-ARCH-010` CI step).

## 3. Run

```bash
pnpm test                                                   # every suite
node ace test functional                                    # one suite
node ace test functional --files=tests/functional/schema/shipments.spec.ts
node ace test --groups="T-ARCH-015 state-dependent CHECKs"  # one group, by its exact title
node ace test --tests="T-ARCH-015 every state-dependent CHECK has a case"   # exact title
```

`--tests` matches a test's title exactly as written in the file. For a test with a dataset, that is the template with its placeholder, such as `--tests="T-ARCH-015 {constraint} refuses {state} without a required value"`, not the expanded name the runner prints.

Reading the output:

- **`Tests (0)` or `ECONNREFUSED 127.0.0.1:5432`** means the database setup failed: PostgreSQL is not running (step 1). The run still exits non-zero.
- A **`pg` DeprecationWarning** about `client.query()` while a query is running is expected. It comes from Lucid running preloads in parallel inside the test's global transaction, not from application code.
- **"Unsupported engine"** on Node older than 24 is a warning only; CI uses Node 24.

After a run, `git status` must show only your own changes. If `database/schema.ts` changed, something ran `migration:run` without `--no-schema-generate` (for example a migration you ran by hand). Restore it with `git checkout database/schema.ts`; the schema classes are generated files ([09 §1.4](../../../docs/09-code-structure-and-engineering-standards.md#14-generated-artefacts)).

## 4. Write a test

### Pick the suite

- **unit**: pure functions with no database, such as `start/env_policy.ts`.
- **functional**: behaviour through an action or the database, or over HTTP with `fetch` against the test server (`tests/functional/platform/error_contract.spec.ts`; `tests/support/browser.ts` keeps cookies and the XSRF token, and `clone()` gives a stale tab with the old session cookie). Nothing persists, so tests never see each other's rows. The server's session rows are written inside the test's global transaction too, so a test route whose SQL fails on purpose runs it in `db.transaction()` (a savepoint); otherwise the aborted transaction also fails the session write.
- **concurrency**: anything about locks, races or double submits. A global transaction would put every "parallel" call on one connection, so the second call would never wait for the first and the test would pass with the lock removed. Here each call commits on its own pool connection, and each round creates its own shop and products. So do limiter tests: the limiter store writes `rate_limits` on its own connection and commits, so each test uses a fresh email and client network and deletes its keys (`tests/concurrency/identity/login_throttle.spec.ts`). Tests of triggers and grants that need the second role go here too: `db.connection('pg_migrator')` runs as the migrator (`MIGRATOR_CONNECTION` in `tests/support/database.ts`), as `tests/concurrency/schema/append_only.spec.ts` (`T-ARCH-012`) does.

### Conventions

- **Titles start with a test ID** from docs/10 §6 when the test proves that ID's behaviour, for example `T-INV-003 four buyers race for the last unit…`. A new behaviour of the target system gets its ID registered in docs/10 §6 first (§6.1 has the numbering rules). Never invent an ID in a test file.
- **No `@v1` tests remain.** The v1 store and its tests left with the E4 baseline (docs/10 Consistency note 40); write every new test to the target system.
- **Set up state through the real actions** once a module has them (M1 onward), so their checks apply. Until then, and for a state a flow cannot reach quickly (an order already `shipped`), insert rows directly with the builders of `tests/support/schema_rows.ts` or the factories, as the runtime would, and keep it obvious in the test.
- **Don't rely on demo data.** The demo seeders never run in tests; only reference data does (the locations of `data/locations.csv`, delivery zones and their districts, categories, attributes, shop categories, settings, the `ncm` courier). Read reference rows, never change them, and give rows you insert into a reference table names that cannot collide with the seeded ones (`test_courier`, `Clothing ${n}`). Create what you need with the fixtures or the factories, and add a fixture rather than copying setup between files.
- **Assert the refusal and that nothing was written**: no order, stock unchanged, cart intact. Half-written state is the bug that costs money.
- **Money** is integer paisa in `bigint` columns (ADR-0007). The int8 parser of `start/database_types.ts` returns numbers, and throws above `Number.MAX_SAFE_INTEGER` (`T-ARCH-013`), so compare with numbers, never strings.

### Patterns that keep lint and the runner happy

```ts
// A refusal by the database: refused() runs the write in a savepoint and
// checks the SQLSTATE and the constraint (tests/support/schema_rows.ts).
await refused(
  assert,
  (trx) => trx.table('logistics_account_shops').insert(values),
  { code, constraint },
  label
)

// A refusal by code: capture it, then assert on it.
const error = await action.handle(payload).then(
  () => null,
  (e) => e
)
assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)

// assert.rejects takes a function. Don't build a list of promises and await them
// one by one: one that rejects before it is awaited is an unhandled rejection.
// Handing a promise straight to a helper that attaches .then() at once, like
// refused(), is fine.
await assert.rejects(() => Shop.findOrFail(missingId), lucidErrors.E_ROW_NOT_FOUND)

// `(await x).y` fails @unicorn/no-await-expression-member: assign first.
const fresh = await InventoryItem.findOrFail(item.id)
assert.equal(fresh.onHand, 3)

// Lucid has no getCount(): count by length.
assert.lengthOf(await ShopOrder.query().where('shop_id', shop.id), 0)
```

Inside `test.group('…', (group) => { … })`, don't name a callback parameter `group` again (`no-shadow`). Import models used only as types with `import type`.

A race test runs the calls together and counts the outcomes. No race test exists yet: the first ones come with the actions they protect, such as `placeOrder` in M5 (`T-INV-003`). Their shape:

```ts
const results = await Promise.allSettled(buyers.map((b) => placeOrder(b, payload)))
// Refusals are fine; any other error (deadlock, constraint) must fail the test.
```

Repeat it for several rounds with fresh data each time.

## 5. Prove the test can fail

A test that passes against broken code proves nothing. Before you trust a new test, break the code it protects and watch it fail, then restore the file:

```bash
sed -i 's/\[1-7\]\[0-9\]{4}/[1-7][0-9]{3}/' database/migrations/1794026524134_baseline_logistics_reference.ts
node ace test functional --files=tests/functional/schema/regex_checks.spec.ts   # must fail on 30608
git checkout database/migrations/1794026524134_baseline_logistics_reference.ts
```

The run setup migrates afresh, so a changed baseline file takes effect in the next run (`T-ARCH-022`: `local_levels_code_check` then refuses the documented example).

For a concurrency test, remove the `.forUpdate()` it relies on: if the test still passes, its calls are not really running in parallel. Report what you broke and what failed; reviewers trust that more than a green run.

## 6. Before you push

```bash
pnpm exec prettier --check .
pnpm lint --max-warnings 0
pnpm typecheck
pnpm test
```

These are the checks CI runs on pull requests into `main` and into the E4 integration branch, with the suites on `postgres:18.4`, together with `node scripts/check_migrations_lock.mjs` and `node scripts/check_migration_extensions.mjs` (`T-ARCH-017`, `T-ARCH-034`).
