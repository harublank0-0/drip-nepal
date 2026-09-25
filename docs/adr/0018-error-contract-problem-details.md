# ADR-0018: Error contract: RFC 9457 problem details with stable codes

Status: Draft v1 (2026-09-25)

## Status

| Field | Value |
|---|---|
| Decision status | **Accepted** |
| Date | 2026-09-25 |
| Deciders | Tech lead (lead developer) |
| Supersedes | — |
| Superseded by | — |
| Related open items | OD-13 (JSON casing: the extension members `request_id` and `errors[]` follow it; the RFC members do not change); fixes RF-36 (raw messages in 5xx) and RF-12 (empty error responses) |

## Context

**Repository today** [Verified-repo, audit evidence]:
- `app/exceptions/handler.ts:10` sets `debug = !app.inProduction`. Line 17 enables status pages only in production: 404 → `errors/not_found`, 500..599 → `errors/server_error`. Lines 32–34 delegate `handle` to the parent class.
- For a request that negotiates JSON, @adonisjs/http-server 9.1.0 `renderErrorAsJSON` sends `{ message: error.message }` whenever debug is off. Knex and pg errors put SQL text and constraint names in `message`, so production 5xx bodies leak internals (**RF-36**).
- Login swallows non-credential errors and returns an empty response (**RF-12**).
- There are no machine-readable error codes anywhere.

**Framework facts** [Verified-doc, `adonis_stack` research, accessed 2026-09-25]:
- For Inertia requests with a session, @adonisjs/session 8.1.0 flashes validation errors and redirects back. @adonisjs/inertia 4.2.0 keeps only the first message per field.
- @tuyau/core 1.2.2 adds a `422 { errors: SimpleError[] }` variant to every route's error type. Its `validationErrorType` option can replace that type. The client exports `TuyauHTTPError`.
- Adonis 7 has no OpenAPI generator, so [openapi.yaml](../openapi.yaml) is written by hand and enforced by T-API-001.

**RFC 9457** [Verified-doc, https://www.rfc-editor.org/rfc/rfc9457.html, accessed 2026-09-25]:
- It obsoletes RFC 7807 and defines `application/problem+json`, with members `type`, `status`, `title`, `detail` and `instance`.
- `type` defaults to `about:blank`. "It is RECOMMENDED that absolute URIs be used in 'type'."
- `title` "SHOULD NOT change from occurrence to occurrence of the problem, except for localization."
- Problem types may add extension members. "Clients consuming problem details MUST ignore any such extensions that they don't recognize."
- The security considerations warn against exposing "implementation details such as a stack dump".

**Who consumes errors:**
- the Inertia pages, which call `/api/v1` through Tuyau (ADR-0004);
- the R3 mobile app;
- support staff quoting a request ID;
- contract tests.

They need structured conflicts (`OUT_OF_STOCK` lines, `PRICE_CHANGED` with a new quote), several messages per field, and a retry hint.

## Decision

1. **Envelope.** Every 4xx and 5xx response under `/api/` is `Content-Type: application/problem+json` with `Cache-Control: no-store`, whatever the `Accept` header says:

   ```json
   {
     "type": "https://dripnepal.com/problems/validation-failed",
     "title": "Validation failed",
     "status": 422,
     "detail": "2 fields need attention.",
     "code": "VALIDATION_FAILED",
     "request_id": "0b7c9f2e-4d1a-4e8b-9a51-2f6d0c3e7a10",
     "errors": [
       { "field": "recipient_phone", "code": "regex", "message": "Enter a 10-digit mobile number starting with 96, 97 or 98." }
     ]
   }
   ```

   The members:
   - **`code`** is the machine key clients switch on. It is SCREAMING_SNAKE_CASE, never renamed and never reused.
   - **`type`** is fixed per code: a constant base URI plus the kebab-case code. The base does not vary by environment [Assumption: production domain].
   - **`title`** is fixed per code, in English in R1.
   - **`detail`** is occurrence-specific, safe for the end user, and never built from an exception message.
   - **`request_id`** equals the `X-Request-Id` response header.
   - **`errors[]`** appears only for `VALIDATION_FAILED`, as `{field, code, message}`. `field` is the dotted input path (`items.0.quantity`), and `code` is the validator rule name.
   - **Extension members.** Code-specific members are defined per code in [docs/06](../06-api-design.md), for example the current representation for `VERSION_CONFLICT`.
   - **`instance`** is omitted in R1.
2. **Canonical codes** (canon §6.6):

   | Status | Codes |
   |---|---|
   | 400 | `INVALID_QUERY_PARAMETER` (unknown or invalid query parameter), `IDEMPOTENCY_KEY_REQUIRED` |
   | 401 | `UNAUTHENTICATED`, `MFA_REQUIRED` |
   | 403 | `FORBIDDEN` (an in-scope actor lacks the permission; also a CSRF failure), `ACCOUNT_SUSPENDED`, `SHOP_NOT_ACTIVE`, `EMAIL_NOT_VERIFIED` |
   | 404 | `NOT_FOUND` (missing, **or belonging to another shop or customer**, or an unknown route) |
   | 409 | `CONFLICT`, `IDEMPOTENCY_IN_PROGRESS`, `OUT_OF_STOCK`, `PRICE_CHANGED`, `CART_CHANGED`, `INVALID_STATE_TRANSITION` |
   | 412 | `VERSION_CONFLICT` (`If-Match` mismatch; the body carries the current representation) |
   | 413 | `PAYLOAD_TOO_LARGE` |
   | 422 | `VALIDATION_FAILED` (including an unparseable JSON body), `IDEMPOTENCY_KEY_REUSED`, `DELIVERY_NOT_AVAILABLE`, `COD_LIMIT_EXCEEDED`, `REFUND_EXCEEDS_REFUNDABLE` |
   | 428 | `PRECONDITION_REQUIRED` (`If-Match` missing) |
   | 429 | `RATE_LIMITED`, with `Retry-After` |
   | 500 | `INTERNAL` |
   | 503 | `PROVIDER_UNAVAILABLE`, with `Retry-After` |

   Adding a code means updating this table, `openapi.yaml` and the code enum in the same PR. Changing a code's meaning needs a superseding ADR (ADR-0001).
3. **404, not 403, across tenants.**
   - Resources in another shop, or another customer's orders, return `NOT_FOUND` with the same `title` and `detail` as a genuinely missing ID. The response is produced by the same scoped query, so the body and the timing give no hint.
   - `FORBIDDEN` is reserved for actors inside the scope, such as a shop member without the permission (ADR-0006).
   - No code may act as an existence oracle. For example, signup with a registered email gets the same response as a new one (RF-38; the flow is in [docs/07](../07-security-threat-model-and-permissions.md)).
4. **One translation point.** Domain code throws `DomainError(code, { detail?, extensions? })`, with status and title taken from the code registry. The exception handler maps everything else:

   | Source error | Result |
   |---|---|
   | Validator errors | `VALIDATION_FAILED` with `errors[]` |
   | Auth guard | `UNAUTHENTICATED` |
   | Limiter | `RATE_LIMITED` |
   | Body-size limit | `PAYLOAD_TOO_LARGE` |
   | PostgreSQL 23505 on an allow-listed constraint | Its mapped code (for example a field error) |
   | Anything else | `INTERNAL`, with detail "Something went wrong. Quote the request ID to support." |

   Production never echoes `error.message`, SQL, constraint names or stacks (RF-36).
5. **Logging.** `report()` sends the full error, with `request_id`, to the logs and the error tracker: 4xx at info, 5xx at error. Nothing in `detail` repeats submitted personal data.
6. **How Inertia pages consume it.**
   - **Mutations.** A thin `apiCall()` wrapper catches `TuyauHTTPError` and parses the body into a typed `Problem`. Tuyau's `validationErrorType` is set to that type (an M0 check; if the option cannot express it, the wrapper narrows the type instead).
   - **Default handling:**
     - `VALIDATION_FAILED` puts every `errors[]` entry into the TanStack Form fields, several per field;
     - `OUT_OF_STOCK`, `CART_CHANGED` and `PRICE_CHANGED` reload the cart or quote props and show what changed;
     - `VERSION_CONFLICT` offers to reload;
     - `UNAUTHENTICATED` and `MFA_REQUIRED` visit `/login` or `/mfa` with a validated return URL (RF-37);
     - `RATE_LIMITED` disables the action for `Retry-After` seconds;
     - an unknown code falls back by status class and shows `request_id`.
   - UI text comes from a `code` → message catalogue, so the R2 Nepali UI can translate it. `detail` is only the fallback.
   - **Page visits (GET)** are not API calls: missing or out-of-scope pages render `errors/not_found`, and 5xx render `errors/server_error`, both with the request ID. Inertia's 409 asset-version response is protocol, not a problem.

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Ad-hoc JSON per controller (`{ message }`, `{ error }`) | The current state. No stable codes, inconsistent shapes, and it leaks internals (RF-36). |
| JSON:API error objects (`{ errors: [{ status, code, source.pointer }] }`) | Designed for JSON:API documents. Our success bodies are plain transformer output, so mixing the two confuses clients. The top-level array complicates single-error handling. No Adonis tooling. |
| Adonis default renderer | Validation errors and other errors take different shapes. With debug off it still returns `error.message` [Verified-repo]. |
| Inertia redirect-back error bag for all mutations | Lossy (first message per field), no codes, unusable by the mobile app and contract tests (ADR-0004). |
| HTTP 200 with an error body | Breaks HTTP semantics, monitoring and retry logic. |

## Consequences

**Positive**
- One documented shape for every client. Codes are stable across releases and languages.
- Support can find any failure from the `request_id` a user quotes.
- Tenant boundaries are not leaked through status codes.

**Negative**
- Every new failure mode needs a code decision and an OpenAPI update.
- The client needs a wrapper instead of Inertia's built-in error bag.

**Risks**
- *Code sprawl or drift between code and spec.* Mitigation: the registry test below.
- *A handler path bypasses the mapping and leaks a message.* Mitigation: the production-mode test below.

## When to revisit

- External API consumers need localised `title` and `detail` through `Accept-Language`.
- A second API version (`/api/v2`) changes error semantics.
- The count of codes passes about 40, which suggests grouping by `type` hierarchy.
- OD-13 chooses camelCase: rename the extension members before the first endpoint merges.

## Verification

- **T-API-001.** Every response in the functional suite, errors included, validates against `openapi.yaml`, and every 4xx and 5xx under `/api/v1` has `Content-Type: application/problem+json`.
- **Code registry test.** The code enum in the code, the `Problem.code` enum in `openapi.yaml` and each code's status and title match exactly.
- **RF-36 test.** The app boots with `NODE_ENV=production`, and a query fails with a constraint violation. The body is `INTERNAL` with the generic detail and contains no SQL, constraint name or stack. The log line has the full error and the same `request_id`.
- **T-SEC-001 and T-SEC-002.** Out-of-scope reads and writes return 404 bodies identical, apart from `request_id`, to a nonexistent ID.
- **Header checks.** `RATE_LIMITED` and `PROVIDER_UNAVAILABLE` carry `Retry-After`. The body's `request_id` equals the `X-Request-Id` header.
- **Frontend component tests.** Two errors on one field both render. An unknown code shows the fallback message with the request ID.

## Related

- [API design: per-code extension members, endpoint catalogue](../06-api-design.md) and [openapi.yaml](../openapi.yaml)
- [Architecture §12.8 errors, health and telemetry](../03-system-architecture.md)
- [Security threat model: enumeration, tenant isolation](../07-security-threat-model-and-permissions.md)
- [Testing and quality gates: T-API-001](../10-testing-and-quality-gates.md)
- ADR-0004 (mutations through `/api/v1`), ADR-0005 (session auth, `ACCOUNT_SUSPENDED`), ADR-0006 (404 vs 403)

## Consistency notes for editor

- Canon §6.6 has no dedicated code for a malformed JSON body, an unsupported media type or a wrong method. This ADR maps them to `VALIDATION_FAILED` (422) and `NOT_FOUND` (404) to stay within the canonical list. A dedicated `MALFORMED_REQUEST` (400) would be cleaner. Decide before `openapi.yaml` freezes.
- CSRF failures are mapped to `FORBIDDEN`. Docs/07 should confirm that clients can tell a CSRF failure apart by `detail` alone, or add a code.
- The `type` base URI assumes the production domain `dripnepal.com`. Replace it if the domain differs.
