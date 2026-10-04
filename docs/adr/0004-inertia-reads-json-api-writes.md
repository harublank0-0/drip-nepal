# ADR-0004: Page reads via Inertia props; mutations via versioned JSON API `/api/v1`

Status: Draft v1 (2026-09-25)

Reviewed: 2026-09-25 · consistency review 2026-09-30 to 2026-10-04

## Status

| Field              | Value                                                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted**                                                                                                                                             |
| Date               | 2026-09-25                                                                                                                                               |
| Deciders           | Lead developer                                                                                                                                           |
| Supersedes         | —                                                                                                                                                        |
| Superseded by      | —                                                                                                                                                        |
| Related open items | OD-13 (JSON casing: snake_case, decided 2026-09-30; does not change this ADR), OD-25 (Inertia v3 `useHttp`; the M0 upgrade spike was decided 2026-09-30) |

Edited 2026-09-30 (consistency review): decision 6 names the `start/routes/api_v1/` folder of [09 §3.3](../09-code-structure-and-engineering-standards.md#33-routes) instead of a single file; the rule is unchanged.

## Context

- **Mutations today are Inertia form posts with no contract** [Verified-repo]. Signup spreads the request payload into the model (RF-36). The client sends prices, shop IDs and order numbers (RF-16). Orders have no idempotency key, so a double tap on "Place order" over a slow connection creates two COD orders (RF-15).
- **Inertia's validation flow is lossy.** With a session, @adonisjs/session 8.1.0 flashes validation errors and redirects back, and @adonisjs/inertia 4.2.0 keeps only the first message per field [Verified-doc, [research: adonis-stack](../research/adonis-stack.md), 4.2.0 `getValidationErrors` source, https://registry.npmjs.org/@adonisjs/inertia/-/inertia-4.2.0.tgz, accessed 2026-09-25]. A redirect cannot carry `OUT_OF_STOCK` line details, `PRICE_CHANGED` with a new quote, an `ETag` or a replayed idempotent response.
- **Tooling.** @tuyau/core 1.2.2 gives a typed client from the route registry and copies the `XSRF-TOKEN` cookie into an `X-XSRF-TOKEN` header automatically [Verified-doc, @tuyau/core 1.2.2 `build/client/index.js`, https://registry.npmjs.org/@tuyau/core/-/core-1.2.2.tgz, accessed 2026-09-25]. No maintained OpenAPI generator targets Adonis 7; `@tuyau/openapi` 1.0.2 predates it [Verified-doc, https://registry.npmjs.org/@tuyau/openapi, accessed 2026-09-25]. Transformers give allowlisted serialization and generated `Data.*` prop types.
- **Future clients.** The R3 mobile app, provider callbacks (R1.1) and possible partners need one language-neutral mutation contract.

## Decision

1. **Reads go through Inertia props.** Page controllers load data with module queries (ADR-0002), serialize through a transformer and render. Pages do not fetch initial data from `/api/v1` (an extra round trip on slow networks). Filters, sorting and pagination are Inertia GET visits with `only`/`preserveState`, so state lives in the URL.
2. **Every state change goes through `/api/v1`.** All non-GET operations, including login and logout (`POST`/`DELETE /api/v1/auth/session`), are JSON endpoints catalogued with operationIds in [06](../06-api-design.md) and [openapi.yaml](../openapi.yaml). Pages call them through the Tuyau client (which sends `X-XSRF-TOKEN`), render problem+json errors by field (ADR-0018), and on success refresh with `router.reload({ only: [...] })` or navigate with `router.visit(...)` ([03 §6.5](../03-system-architecture.md#6-frontend-architecture)).
   - _Exception:_ `GET /payments/{provider}/return` is an SSR page route that runs the server-side payment lookup before rendering (ADR-0012). It is a GET whose only effect is an idempotent, lookup-driven status application.
   - _Exception:_ `POST /api/v1/webhooks/payments/{provider}` is reserved for a provider that notifies server-to-server, CSRF-exempt by exact route and trusted only after a lookup. eSewa ePay and Khalti KPG-2 web checkout document no such webhook ([01 §4.4](../01-product-requirements.md#44-r11-gateway-the-platform-as-payee), ADR-0012).
3. **Contract rules** (full text in [06](../06-api-design.md)):
   - Version in the path; additive changes allowed; breaking changes need `/api/v2`, with a 6-month overlap and `Deprecation`/`Sunset` headers once external clients exist.
   - Money is `{ "amount_minor": <int>, "currency": "NPR" }` (ADR-0007); timestamps are RFC 3339 UTC; field casing snake_case (OD-13, decided 2026-09-30).
   - `Idempotency-Key` is required on operations marked ⚷ (`placeOrder`, cancellations, fulfilment events, inventory adjustments, refunds, payouts…). Missing: 400 `IDEMPOTENCY_KEY_REQUIRED`; same key with a different body: 422 `IDEMPOTENCY_KEY_REUSED` (AC-J05-04).
   - `If-Match` is required on PATCH/PUT of versioned resources (⟳); the strong tag `ETag: "<version>"` is returned (note below); a mismatch gives 412 `VERSION_CONFLICT`, a missing header 428 `PRECONDITION_REQUIRED`.

     Edited 2026-10-01 (tech lead decision): strong ETags. Versioned resources return `ETag: "<version>"` with no `W/` prefix, which replaces `ETag: W/"<version>"`. `If-Match` uses strong comparison (RFC 9110 §13.1.1): only `"<version>"` equal to the current version passes; a weak tag or any other value gives 412 `VERSION_CONFLICT` with the current representation; a missing header, `*` or a list of tags stays 428 `PRECONDITION_REQUIRED`. The version is treated as a strong validator of the resource's editable state [Assumption] ([06 §8](../06-api-design.md#8-concurrent-edits-etag-and-if-match), [09 §4.1](../09-code-structure-and-engineering-standards.md#41-transformer-rules) rule 7). The rest of the decision is unchanged.

     Edited 2026-10-04 (product owner and tech lead decision): two POST state transitions are also ⟳. `approveShopApplication` and `rejectShopApplication` require `If-Match` with the `shops.version` the reviewer loaded, so an owner edit of the profile, shipping, logo or banner made during review answers 412 `VERSION_CONFLICT` with `current` and is reviewed again ([06 §8](../06-api-design.md#8-concurrent-edits-etag-and-if-match), [risks §2.3](../risks-and-open-decisions.md#23-decision-log)). The rest of the decision is unchanged.

   - Server-computed fields (prices, totals, commission, `shop_id`, order numbers) are never read from request bodies (T-SEC-003).

4. **Idempotency mechanism.** Rows live in `idempotency_keys`, UNIQUE (`actor_scope`, `operation`, `key`) ([04a §15.2](../04a-data-dictionary-tables.md#152-idempotency_keys)). The row is inserted as the **first statement of the business transaction**, so a concurrent duplicate waits on the unique index and then replays the committed response; if the first request rolls back (for example `OUT_OF_STOCK`), nothing is stored and a retry runs again. Keys are client-generated, 16–64 characters `[A-Za-z0-9_-]`; retention 24 h, 72 h for `placeOrder` [A-32]. The walk-through is [05 §4.6](../05-order-payment-and-inventory-lifecycles.md#46-idempotency-handling).
5. **Authentication** is the same session cookie and CSRF header as pages (ADR-0005). Token auth for non-browser clients waits for R3.
6. **Route files.** Unsafe methods are registered only under `start/routes/api_v1/` (one file per surface, [09 §3.3](../09-code-structure-and-engineering-standards.md#33-routes)) and in `start/routes/webhooks.ts`; page route files register GET routes only.

## Alternatives considered

| Alternative                          | Why rejected                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Inertia form posts for all mutations | No natural place for `Idempotency-Key`, `If-Match`/`ETag` or structured conflict payloads; errors flattened to one message per field; unusable by R3 clients; hard to contract-test. |
| JSON API for reads too (SPA style)   | An extra request after every navigation on slow networks, and it defeats SSR (ADR-0003).                                                                                             |
| GraphQL                              | Schema, per-field authorization and persisted queries for 1–2 developers; HTTP caching and problem+json semantics get harder.                                                        |
| Tuyau types only, no OpenAPI         | TypeScript-only; providers, mobile clients and contract tests need a language-neutral spec.                                                                                          |
| Unversioned API                      | The first breaking change after the R3 app ships would break installed clients with no overlap.                                                                                      |

## Consequences

**Positive**

- One mutation contract, validated on every functional-test response (T-API-001), reusable by the R3 app.
- Double submits on slow networks are harmless (T-CHK-004); concurrent seller edits are detected (412) instead of silently overwritten.
- Mass assignment is structurally prevented: validators never contain server-owned fields (T-SEC-003).

**Negative**

- Each mutating screen has a page route and API routes; a mutation costs one extra partial reload.
- `docs/openapi.yaml` is hand-maintained; a route change without a spec change fails CI instead of being generated. It starts as a foundation (shared components plus the operations of 06 §14's worked examples, `x-foundation-scope`); each remaining operation (`x-pending-operations`) is specified in the PR that implements it [Confirmed, product owner 2026-09-26].
- Client code handles problem+json explicitly (a small `useApiMutation` hook) instead of Inertia's error bag.

**Risks**

- _An Inertia POST route added "just this once"._ Mitigation: the route-file rule, checked in CI.
- _Spec drift._ Mitigation: T-API-001 fails the build on a missing or wrong schema.

## When to revisit

- The OD-25 spike moves the app to Inertia v3: `useHttp` and optimistic updates may simplify client calls; the API contract stays.
- External partners (R3 couriers, marketing tools) need OAuth or API keys: add a token guard in a new ADR.
- More than 3 T-API-001 failures from spec drift in one milestone: evaluate a generator such as `@foadonis/openapi` 1.1.0 (peers `@adonisjs/core ^6.2 || ^7`) [Verified-doc, https://registry.npmjs.org/@foadonis/openapi, accessed 2026-09-25].

## Verification

- **T-API-001**: every response in the functional suite validates against `docs/openapi.yaml`.
- **T-CHK-004**: repeated `placeOrder` with the same key returns the same order; concurrent duplicates create one order.
- **T-SEC-003**: client-supplied price, total, `shop_id` and commission fields are rejected with 422 `VALIDATION_FAILED` (`unknown_field`).
- **Concurrency check** (T-API-004, proposed; [10 §6.3](../10-testing-and-quality-gates.md#63-api-contract-t-api)): every ⟳ operation answers 428 without `If-Match`, with `*` or with a list, and 412 `VERSION_CONFLICT` with `current` for a stale version or a weak tag; reads carry the strong `ETag`.
- **Route rule check** (T-API-006, proposed; [10 §6.3](../10-testing-and-quality-gates.md#63-api-contract-t-api)): lists registered routes and fails if a POST/PUT/PATCH/DELETE route is outside `/api/v1/`.
- **T-ARCH-001**: controllers call module actions only.

## Related

- [06 API design](../06-api-design.md) · [OpenAPI](../openapi.yaml) · [03 §6.5 reads and writes](../03-system-architecture.md#6-frontend-architecture) · [05 §4.6 idempotency](../05-order-payment-and-inventory-lifecycles.md#46-idempotency-handling)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md), [ADR-0005](0005-session-auth-server-side-revocation.md), [ADR-0007](0007-money-integer-minor-units.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md), [ADR-0018](0018-error-contract-problem-details.md)
