# ADR-0018: Error contract: RFC 9457 problem details with stable codes

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                                                               |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted**                                                                                                                                                                        |
| Date               | 2026-09-25                                                                                                                                                                          |
| Deciders           | Lead developer                                                                                                                                                                      |
| Supersedes         | —                                                                                                                                                                                   |
| Superseded by      | —                                                                                                                                                                                   |
| Related open items | None open: OD-13 (JSON casing of the extension members `request_id` and `errors[]`) was decided on 2026-09-30 for snake_case; the RFC members do not change. Fixes RF-36 and RF-12. |

Edited 2026-09-30 (consistency review): decisions 1 and 2 follow [06 §5](../06-api-design.md#5-error-contract) and [07 §3.3](../07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision): `errors[]` also carries the per-line reasons of five non-validation codes, `IDEMPOTENCY_KEY_REQUIRED` is 400, `SERVICE_BUSY` is proposed for both catalog-read causes of [06 §5.2](../06-api-design.md#52-codes), and the CSRF mapping is decided; the contract is otherwise unchanged.

## Context

**Repository today** [Verified-repo; [research: repository-audit](../research/repository-audit.md)]:

- `app/exceptions/handler.ts:10` sets `debug = !app.inProduction`; status pages are enabled only in production (404 → `errors/not_found`, 5xx → `errors/server_error`); `handle` delegates to the parent.
- For a JSON request, @adonisjs/http-server 9.1.0 `renderErrorAsJSON` sends `{ message: error.message }` with debug off. Knex and pg errors put SQL and constraint names in `message`, so production 5xx bodies leak internals (**RF-36**).
- Login swallows non-credential errors and returns an empty response (**RF-12**). No machine-readable codes exist.

**Framework facts** [Verified-doc, [research: adonis-stack](../research/adonis-stack.md), accessed 2026-09-25]:

- For Inertia requests with a session, @adonisjs/session 8.1.0 flashes validation errors and redirects back; @adonisjs/inertia 4.2.0 keeps one message per field.
- @tuyau/core 1.2.2 adds a `422 { errors: SimpleError[] }` variant to every route's error type; its `validationErrorType` option can replace it. The client exports `TuyauHTTPError`.
- Adonis 7 has no OpenAPI generator, so [openapi.yaml](../openapi.yaml) is hand-written and enforced by T-API-001.

**RFC 9457** [Verified-doc, <https://www.rfc-editor.org/rfc/rfc9457.html>, accessed 2026-09-25]: obsoletes RFC 7807; defines `application/problem+json` with `type`, `status`, `title`, `detail`, `instance`; "It is RECOMMENDED that absolute URIs be used in 'type'"; `title` "SHOULD NOT change from occurrence to occurrence … except for localization"; clients "MUST ignore any such extensions that they don't recognize"; warns against exposing "implementation details such as a stack dump".

**Consumers**: Inertia pages calling `/api/v1` through Tuyau (ADR-0004), the R3 mobile app, support staff quoting a request ID, and contract tests. They need structured conflicts (`OUT_OF_STOCK` lines, `PRICE_CHANGED` with a new quote), several messages per field, and a retry hint.

## Decision

1. **Envelope** ([06 §5.1](../06-api-design.md#51-shape)). Every 4xx and 5xx under `/api/` is `Content-Type: application/problem+json` with `Cache-Control: no-store`, whatever `Accept` says:

   ```json
   {
     "type": "https://dripnepal.com/problems/validation-failed",
     "title": "Validation failed",
     "status": 422,
     "detail": "2 fields need attention.",
     "code": "VALIDATION_FAILED",
     "request_id": "0b7c9f2e-4d1a-4e8b-9a51-2f6d0c3e7a10",
     "errors": [
       {
         "field": "recipient_phone",
         "code": "regex",
         "message": "Enter a 10-digit mobile number starting with 96, 97 or 98."
       }
     ]
   }
   ```

   - `code` is the machine key clients switch on: `SCREAMING_SNAKE_CASE`, never renamed or reused.
   - `type` is a constant base URI plus the kebab-case code [Assumption: production domain `dripnepal.com`]; `title` is fixed per code, English in R1.
   - `detail` is occurrence-specific, safe for end users, and never built from an exception message.
   - `request_id` equals the `X-Request-Id` response header.
   - `errors[]` appears for `VALIDATION_FAILED`, and for the per-line reasons of `INVALID_QUERY_PARAMETER`, `OUT_OF_STOCK`, `CART_CHANGED`, `DELIVERY_NOT_AVAILABLE` and `CONFLICT` ([06 §5.1](../06-api-design.md#51-shape)), as `{field, code, message}` plus optional code-specific members, with a dotted `field` path (`items.0.quantity`) or `null`.
   - Code-specific extension members (for example the current representation with `VERSION_CONFLICT`) are defined in [06](../06-api-design.md). `instance` is omitted in R1.

2. **Codes.** The list is owned by [06 §5.2](../06-api-design.md#52-codes); rows marked _proposed_ are not final until 06 and `openapi.yaml` adopt them.

   | Status | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
   | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 400    | `INVALID_QUERY_PARAMETER`, `IDEMPOTENCY_KEY_REQUIRED` (400, not 428; [06 §5.2](../06-api-design.md#52-codes)); _proposed_ `MALFORMED_REQUEST` (unparseable JSON body)                                                                                                                                                                                                                                                                                                                                                                                   |
   | 401    | `UNAUTHENTICATED`, `MFA_REQUIRED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
   | 403    | `FORBIDDEN`, `ACCOUNT_SUSPENDED` (T-SEC-010), `SHOP_NOT_ACTIVE`, `EMAIL_NOT_VERIFIED`                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
   | 404    | `NOT_FOUND` (missing, **or in another shop or customer's scope**, or an unknown route)                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
   | 409    | `CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `OUT_OF_STOCK`, `PRICE_CHANGED`, `CART_CHANGED`, `INVALID_STATE_TRANSITION`                                                                                                                                                                                                                                                                                                                                                                                                                                      |
   | 412    | `VERSION_CONFLICT` (`If-Match` mismatch)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
   | 413    | `PAYLOAD_TOO_LARGE`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
   | 422    | `VALIDATION_FAILED`, `IDEMPOTENCY_KEY_REUSED`, `DELIVERY_NOT_AVAILABLE`, `COD_LIMIT_EXCEEDED`, `REFUND_EXCEEDS_REFUNDABLE`                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | 428    | `PRECONDITION_REQUIRED` (`If-Match` missing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
   | 429    | `RATE_LIMITED`, with `Retry-After`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
   | 500    | `INTERNAL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
   | 503    | `PROVIDER_UNAVAILABLE`, with `Retry-After`; also the checkout kill switch (`checkout_enabled = false`, [05 §4.1](../05-order-payment-and-inventory-lifecycles.md#41-inputs-preconditions-and-the-quote) and note 9); _proposed_ `CHECKOUT_DISABLED`; _proposed_ `SERVICE_BUSY`, with `Retry-After` (a storefront listing or search read that waits more than 1 s for a slot under the catalog-read cap, or that the 2 s read limit cancels; [07 TM-24](../07-security-threat-model-and-permissions.md#tm-24-resource-exhaustion-and-expensive-queries)) |

   Until `MALFORMED_REQUEST` is adopted, an unparseable body maps to `VALIDATION_FAILED`. A CSRF failure maps to 403 `FORBIDDEN`, except 401 `UNAUTHENTICATED` when the session holds no `auth_web` and the route runs the `auth` middleware ([07 §3.3](../07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision), [06 §4.1](../06-api-design.md#41-session-and-csrf)). Adding a code updates this table, `openapi.yaml` and the code enum in one PR; changing a code's meaning needs a superseding ADR (ADR-0001).

3. **404, not 403, across tenants.** Another shop's resources or another customer's orders return `NOT_FOUND` with the same `title` and `detail` as a missing ID, produced by the same scoped query. `FORBIDDEN` is only for in-scope actors lacking a permission (ADR-0006). No code may act as an existence oracle; for example, signup with a registered email gets the same response as a new one (RF-38, [07](../07-security-threat-model-and-permissions.md)).
4. **One translation point.** Domain code throws `DomainError(code, { detail?, extensions? })`; status and title come from the code registry. The exception handler maps validator errors to `VALIDATION_FAILED` with `errors[]`, the auth guard to `UNAUTHENTICATED`, the limiter to `RATE_LIMITED`, the body limit to `PAYLOAD_TOO_LARGE`, SQLSTATE 23505/23514 on allow-listed constraints to field errors ([04 §2.8](../04-domain-model-and-data-dictionary.md#28-text-normalisation-and-lengths)), SQLSTATE 22001 to `VALIDATION_FAILED` (note below), and anything else to `INTERNAL` with "Something went wrong. Quote the request ID to support." Production never echoes `error.message`, SQL, constraint names or stacks.

   Edited 2026-10-01 (tech lead decision): every SQLSTATE 22001 (value too long) maps to 422 `VALIDATION_FAILED` with one `errors[]` item whose `field` is `null`, logged at `warn` as validator drift ([09 §5.4](../09-code-structure-and-engineering-standards.md#54-the-exception-handler), [06 §5.3](../06-api-design.md#53-domain-errors-to-http)). A 22001 error carries no constraint name, so it cannot be mapped per constraint; this replaces "22001 on allow-listed constraints". The rest of the decision is unchanged.

5. **Logging.** `report()` sends the full error with `request_id` to logs and the error tracker (4xx info, 5xx error). `detail` never repeats submitted personal data.
6. **Inertia pages.** A thin `apiCall()` wrapper catches `TuyauHTTPError` and parses a typed `Problem`; Tuyau's `validationErrorType` is set to that type (M0 check; otherwise the wrapper narrows it). Defaults: `VALIDATION_FAILED` fills every TanStack Form field message; `OUT_OF_STOCK`, `CART_CHANGED` and `PRICE_CHANGED` reload the cart or quote props and show what changed; `VERSION_CONFLICT` offers a reload; `UNAUTHENTICATED`/`MFA_REQUIRED` visit `/login` or `/mfa` with a validated return URL (RF-37); `RATE_LIMITED` disables the action for `Retry-After`; unknown codes fall back by status class and show `request_id`. UI text comes from a `code` → message catalogue for the R2 Nepali UI. Page visits (GET) render `errors/not_found` or `errors/server_error` with the request ID; Inertia's 409 asset-version response is protocol, not a problem.

## Alternatives considered

| Alternative                                       | Why rejected                                                                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Ad-hoc JSON per controller (`{ message }`)        | The current state: no stable codes, inconsistent shapes, leaks internals (RF-36).                                                 |
| JSON:API error objects                            | Built for JSON:API documents; our success bodies are plain transformer output, and the top-level array complicates single errors. |
| Adonis default renderer                           | Validation and other errors take different shapes, and with debug off it still returns `error.message`.                           |
| Inertia redirect-back error bag for all mutations | One message per field, no codes, unusable by the mobile app and contract tests (ADR-0004).                                        |
| HTTP 200 with an error body                       | Breaks HTTP semantics, monitoring and retry logic.                                                                                |

## Consequences

**Positive**

- One documented shape for every client; codes are stable across releases and languages.
- Support can find any failure from the `request_id` a user quotes.
- Tenant boundaries are not leaked through status codes.

**Negative**

- Every new failure mode needs a code decision and an OpenAPI update.
- The client needs a wrapper instead of Inertia's built-in error bag.

**Risks**

- _Code sprawl or drift between code and spec._ Mitigation: the registry test.
- _A handler path bypasses the mapping and leaks a message._ Mitigation: the production-mode test.

## When to revisit

- 06 decides the proposed codes (`MALFORMED_REQUEST`, `CHECKOUT_DISABLED`, `SERVICE_BUSY`) before `openapi.yaml` freezes. A CSRF-specific code is not needed: [07 §3.3](../07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision) maps `E_BAD_CSRF_TOKEN` to 401 or 403.
- External consumers need localised `title` and `detail` via `Accept-Language`, or `/api/v2` changes error semantics.
- The code count passes about 40 [Assumption]: group by `type` hierarchy.

## Verification

- **T-API-001**: every response in the functional suite validates against `openapi.yaml`, and every 4xx and 5xx under `/api/v1` is `application/problem+json`.
- **Code registry test** (T-API-011, proposed): the code enum, `openapi.yaml`'s `Problem.code` enum and each code's status and title match exactly.
- **Error-source mapping test** (T-API-012, proposed; [09 §5.4](../09-code-structure-and-engineering-standards.md#54-the-exception-handler)): `toProblem()` maps one instance of every error source to its exact body, including a SQLSTATE 22001 error to 422 `VALIDATION_FAILED` with a `null` field.
- **RF-36 test** (T-SEC-027, proposed): with `NODE_ENV=production`, a constraint violation yields `INTERNAL` with the generic detail and no SQL, constraint name or stack; the log line holds the full error with the same `request_id`.
- **T-SEC-001, T-SEC-002**: out-of-scope reads and writes return 404 bodies identical, apart from `request_id`, to a nonexistent ID. **T-SEC-010**: a suspended user's next API request gets 403 `ACCOUNT_SUSPENDED` while the session exists, and 401 `UNAUTHENTICATED` once `identity.revoke_sessions` has destroyed it, never a 2xx; a stamp-only mismatch is 401 ([07 §3.3](../07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision)).
- **Header checks** (T-API-005, proposed): `RATE_LIMITED` and `PROVIDER_UNAVAILABLE` carry `Retry-After`; body `request_id` equals `X-Request-Id`.
- **Frontend component tests** (T-UI-005, proposed): two errors on one field both render; an unknown code shows the fallback with the request ID.

## Related

- [API design](../06-api-design.md) and [openapi.yaml](../openapi.yaml)
- [03 §12.8 errors, health and telemetry](../03-system-architecture.md#128-errors-health-and-telemetry)
- [05 §4.1 checkout preconditions (kill switch)](../05-order-payment-and-inventory-lifecycles.md#41-inputs-preconditions-and-the-quote)
- [Security threat model](../07-security-threat-model-and-permissions.md), [Testing and quality gates](../10-testing-and-quality-gates.md)
- [ADR-0004](0004-inertia-reads-json-api-writes.md) (mutations through `/api/v1`), [ADR-0005](0005-session-auth-server-side-revocation.md) (`ACCOUNT_SUSPENDED`), [ADR-0006](0006-authorization-platform-roles-shop-memberships.md) (404 vs 403)
