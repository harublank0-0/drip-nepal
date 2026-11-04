---
name: dripnepal-testing
description: Runs and writes DripNepal's automated tests (Japa unit, functional and concurrency suites on PostgreSQL). Use whenever you add or change server behaviour, write, fix or run a test, need a test database (on a laptop with Docker or in a cloud session without it), see a failing `pnpm test` or a red "Tests" job in CI, or need to prove that a lock, race or double submit is handled. Use it even when the user only says "make sure this works", "add coverage" or "is checkout safe?".
---

# DripNepal testing

How to get a test database, run the suites, and write tests that prove something. `docs/10-testing-and-quality-gates.md` owns the test strategy, the test ID registry (§6) and the CI gates (§5); this skill is the hands-on part. Read the owner when you need a rule's reasoning.

## What is already here

| Piece          | Where                                                                               | What it does                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suites         | `adonisrc.ts`                                                                       | `unit` (no database), `functional` (database, each test rolled back), `concurrency` (database, real commits), `browser` (configured, no specs yet)                    |
| Database setup | `tests/support/database.ts`, called from `configureSuite` in `tests/bootstrap.ts`   | Once per run: `db:wipe`, `migration:run --no-schema-generate`, then the reference seeders (categories, shop categories, attributes, roles)                            |
| Isolation      | `tests/bootstrap.ts`                                                                | Every `functional` test runs inside a global transaction that is rolled back; service `db.transaction()` calls become savepoints. `concurrency` tests commit for real |
| Fixtures       | `tests/support/fixtures.ts`                                                         | `createCustomer`, `createShop`, `createVariant`, `fillCart`, `guestOwner`, `addressPayload`; every call makes unique rows                                             |
| Examples       | `tests/functional/orders/*.spec.ts`, `tests/concurrency/orders/stock_races.spec.ts` | Checkout, order status, cart, and the stock and status races                                                                                                          |
| Safety guard   | `start/env_policy.ts`                                                               | Under `NODE_ENV=test`, boot refuses any `DB_DATABASE` that doesn't end in `_test`, so a test run can only ever wipe a test database                                   |

## 1. Get a database

Check first: `pg_isready -h localhost`. If it answers, skip to step 2.

**With Docker (a developer laptop):** `docker compose up -d`. The init script in `docker/postgres/init/` creates `dripnepal_test` on a fresh volume. On an older volume, create it once: `docker compose exec postgres createdb -U dripnepal dripnepal_test`.

**Without Docker (a Claude Code cloud session):** there is no Docker daemon, but PostgreSQL server binaries are often installed. Start one as the `postgres` user in a directory that user can reach (it cannot read the session scratchpad):

```bash
PGBIN=$(ls -d /usr/lib/postgresql/*/bin | sort -V | tail -1)
D=/var/lib/postgresql/drip-test-data
mkdir -p "$D" && chown postgres:postgres "$D"
[ -f "$D/PG_VERSION" ] || su postgres -c "$PGBIN/initdb -D $D -U postgres --auth=trust"
su postgres -c "$PGBIN/pg_ctl -D $D status" >/dev/null \
  || su postgres -c "$PGBIN/pg_ctl -D $D -o '-p 5432 -k /tmp' -l $D/log start"
psql -h localhost -U postgres -tc "select 1 from pg_roles where rolname='dripnepal'" | grep -q 1 \
  || psql -h localhost -U postgres -c "create role dripnepal login password 'secret' superuser"
psql -h localhost -U postgres -tc "select 1 from pg_database where datname='dripnepal_test'" | grep -q 1 \
  || psql -h localhost -U postgres -c "create database dripnepal_test owner dripnepal"
```

The block is safe to rerun: each step checks before it acts. A restart of the session's worker stops this server; run the block again to bring it back.

Production and CI run PostgreSQL 18.4. An older local server (16 is common) runs the current migrations, but say which version you ran on when you report results, because CI is the first run on 18.4.

## 2. Environment

`.env` is gitignored, so a fresh clone has none. Create it and give it a key:

```bash
cp .env.example .env
sed -i "s|^APP_KEY=.*|APP_KEY=$(openssl rand -base64 32)|" .env
```

`.env.test` (committed) switches to `NODE_ENV=test`, `SESSION_DRIVER=memory` and `DB_DATABASE=dripnepal_test`. CI has no `.env`: the "Tests" job in `.github/workflows/ci.yml` sets the same variables in its `env:` block.

## 3. Run

```bash
pnpm test                                                   # every suite
node ace test functional                                    # one suite
node ace test functional --files=tests/functional/orders/cart.spec.ts
node ace test --groups="Order access [v1]"                  # one group, by its exact title
node ace test --tests="cancelling twice is refused the second time"
node ace test --tags=@v1                                    # every v1 test
```

Reading the output:

- **`Tests (0)` or `ECONNREFUSED 127.0.0.1:5432`** means the database setup failed: PostgreSQL is not running (step 1). The run still exits non-zero.
- A **`pg` DeprecationWarning** about `client.query()` while a query is running is expected. It comes from Lucid running preloads in parallel inside the test's global transaction, not from application code.
- **"Unsupported engine"** on Node older than 24 is a warning only; CI uses Node 24.

After a run, `git status` must show only your own changes. If `database/schema.ts` changed, something ran `migration:run` without `--no-schema-generate` (for example a migration you ran by hand). Restore it with `git checkout database/schema.ts`; the schema classes are generated files ([09 §1.4](../../../docs/09-code-structure-and-engineering-standards.md#14-generated-artefacts)).

## 4. Write a test

### Pick the suite

- **unit**: pure functions with no database, such as `start/env_policy.ts`.
- **functional**: behaviour through a service (or over HTTP once `@japa/api-client` is added in M0). Nothing persists, so tests never see each other's rows.
- **concurrency**: anything about locks, races or double submits. A global transaction would put every "parallel" call on one connection, so the second call would never wait for the first and the test would pass with the lock removed. Here each call commits on its own pool connection, and each round creates its own shop and products.

### Conventions

- **Titles start with a test ID** from docs/10 §6 when the test proves that ID's behaviour, for example `T-INV-003 four buyers race for the last unit…`. A new behaviour of the target system gets its ID registered in docs/10 §6 first (§6.1 has the numbering rules). Never invent an ID in a test file.
- **Tests of the v1 store are tagged `@v1`** with `group.tap((t) => t.tags(['@v1']))`, so M0 can find and replace them as it rebuilds each flow to docs/05 (docs/10 Consistency note 29).
- **Set up state through the real services**, for example `fillCart` calls `CartService.add`, so their stock and availability checks apply. Write rows directly (`Model.query().where(...).update(...)`) only for a state the flow cannot reach quickly, such as an order already `shipped`, and keep it obvious in the test.
- **Don't rely on demo data.** The demo seeders never run in tests; only reference data does. Create what you need with the fixtures, and add a fixture rather than copying setup between files.
- **Assert the refusal and that nothing was written**: no order, stock unchanged, cart intact. Half-written state is the bug that costs money.
- **Money in v1** is rupees stored as `numeric`, which Lucid returns as strings: compare with `Number(order.grandTotal)`. The target system stores integer paisa (ADR-0007).

### Patterns that keep lint and the runner happy

```ts
// A validation refusal: capture it, then assert on its first message.
const error = await service.placeOrders(buyer, payload).then(
  () => null,
  (e) => e
)
assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
assert.match(error.messages[0].message, /just sold out/)

// Pass a function to assert.rejects, never a promise created earlier: a promise
// that rejects before anything awaits it is an unhandled rejection.
await assert.rejects(() => orders.findForShop(otherShop, number), lucidErrors.E_ROW_NOT_FOUND)

// `(await x).y` fails @unicorn/no-await-expression-member: assign first.
const fresh = await ProductVariant.findOrFail(variant.id)
assert.equal(fresh.quantity, 3)

// Lucid has no getCount(): count by length.
assert.lengthOf(await Order.query().where('shop_id', shop.id), 0)
```

Inside `test.group('…', (group) => { … })`, don't name a callback parameter `group` again (`no-shadow`). Import models used only as types with `import type`.

A race test runs the calls together and counts the outcomes:

```ts
const results = await Promise.allSettled(
  buyers.map((b) => new CheckoutService().placeOrders(b, payload))
)
// Refusals are fine; any other error (deadlock, constraint) must fail the test.
```

Repeat it for several rounds with fresh data each time; see `settle()` and `ROUNDS` in `tests/concurrency/orders/stock_races.spec.ts`.

## 5. Prove the test can fail

A test that passes against broken code proves nothing. Before you trust a new test, break the code it protects and watch it fail, then restore the file:

```bash
sed -i "s/.decrement('quantity', item.quantity)/.where('id', 'none')/" app/modules/orders/services/checkout_service.ts
node ace test functional --files=tests/functional/orders/checkout.spec.ts   # must fail
git checkout app/modules/orders/services/checkout_service.ts
```

For a concurrency test, remove the `.forUpdate()` it relies on: if the test still passes, its calls are not really running in parallel. Report what you broke and what failed; reviewers trust that more than a green run.

## 6. Before you push

```bash
pnpm exec prettier --check .
pnpm lint --max-warnings 0
pnpm typecheck
pnpm test
```

These are the checks CI runs on pull requests into `main` and `v1`, with the suites on `postgres:18.4`.
