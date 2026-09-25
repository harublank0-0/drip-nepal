# ADR-0005: Session-cookie authentication with server-side revocation

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.3 (2026-09-25)

## Status

| Field              | Value                                                                                                                                             |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decision status    | **Accepted**                                                                                                                                      |
| Date               | 2026-09-25                                                                                                                                        |
| Deciders           | Lead developer, product owner                                                                                                                     |
| Supersedes         | —                                                                                                                                                 |
| Superseded by      | —                                                                                                                                                 |
| Related open items | Lifetimes A-23 and password length A-22 are [Assumption]. VX-03 (reading of Directive 2082 s8(1) "encrypted form"). Neither changes the decision. |

## Context

**Repository state** [Verified-repo] (RF-04, RF-12):

- `.env.example:13` sets `SESSION_DRIVER=cookie`: no server-side session record, so no "log out everywhere" or forced logout.
- `session_controller.ts:15-16` logs in without checking `users.status`, so suspended users keep working.
- Login has no rate limit, swallows non-credential errors and caps passwords at 32 characters.

**Framework behaviour** [Verified-doc, `adonis_stack` digest of the locked package sources, https://registry.npmjs.org/@adonisjs/auth/-/auth-10.1.0.tgz and https://registry.npmjs.org/@adonisjs/session/-/session-8.1.0.tgz, accessed 2026-09-25]:

- @adonisjs/auth 10.1.0 `login()` calls `session.regenerate()` (fixation protection); `logout()` does not. The guard re-queries the user on every request but has no suspended-user check.
- @adonisjs/session 8.1.0 offers `stores.database()` (table from `make:session-table`) and tagging (`session.tag(userId)`, `SessionCollection.tagged(userId)`/`destroy(id)`); the cookie store supports neither and silently truncates data over about 4 KB [Verified-doc, https://docs.adonisjs.com/guides/basics/session, accessed 2026-09-25].
- Reading the source (not run) suggests tagging must follow `login()`.
- @adonisjs/limiter 3.0.1 has a database store with `penalize()` (OD-10 resolved).

**Requirements.** Suspension, password change and "sign out everywhere" act on the next request (FR-IAM-005, FR-IAM-006, NFR-SEC-004). TOTP MFA is mandatory for platform staff (FR-IAM-007). Directive 2082 s8(1) requires passwords and other authentication data to be stored "in encrypted form"; for passwords we read this as a one-way hash [Verify-external VX-03]. Customers often share phones. WCAG 2.2 SC 3.3.8 fails authentication fields that block paste [Verified-doc, https://www.w3.org/WAI/WCAG22/Understanding/accessible-authentication-minimum.html, accessed 2026-09-25].

## Decision

1. **Guard and store.** Session guard `web`; @adonisjs/session **database store** (`sessions` table, [04a §5.3](../04a-data-dictionary-tables.md#53-sessions-session-store-table)); cookie `dripnepal_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`; no Redis in R1 (ADR-0002). What session `data` may hold is fixed in 04a §5.3 (no cart, no personal data beyond the user ID).
2. **Per-user `security_stamp`** (uuid on `users`), copied into the session at login and compared on every authenticated request by the account-status middleware ([03 §3.3](../03-system-architecture.md#33-inside-the-web-process)). It rotates on password change or reset, suspension, "revoke all sessions", platform-staff role change and MFA reset; the acting session receives the new stamp where the user stays signed in (AC-FR-IAM-005-2). A mismatch destroys the session and answers 401 `UNAUTHENTICATED` (API) or redirects to `/login`.
3. **Status gate in the same middleware.** `suspended`, `deactivated` or `anonymized` users get 403 `ACCOUNT_SUSPENDED` (API) or a redirect with a notice, and the session is destroyed. Login applies the same check before `login()`. `pending_verification` users may use account pages and the cart but get 403 `EMAIL_NOT_VERIFIED` at checkout and shop application.
4. **Revocation of live sessions.** `suspendUser`, `changePassword` and `revokeAllSessions` rotate the stamp in their transaction and send `identity.revoke_sessions`, which destroys every session tagged with the user ID ([03 §7.7](../03-system-architecture.md#77-suspension-taking-effect-on-an-existing-session-j-17-fr-iam-006-t-sec-010)). The stamp and status check is the guarantee if the job has not run yet. Job payloads carry the user ID only, never a session ID or raw token; queues that must carry a token delete completed jobs after one day ([04a §15.5](../04a-data-dictionary-tables.md#155-pg-boss-schema-pgboss)).
5. **Session hygiene.** `session.tag(String(user.id))` after `login()`. The ID is regenerated at login, after the MFA challenge and on privilege change. Logout calls `auth.logout()`, `session.untag()`, `session.regenerate()` and `inertia.clearHistory()` (ADR-0003). Expired rows are removed by the store's probabilistic garbage collection (04a §5.3).
6. **Lifetimes** [Assumption A-23]: customers idle 7 days, absolute 30 days; sellers idle 12 h; platform staff idle 2 h, and `/admin` plus `/api/v1/admin` need `mfa_verified_at` within 12 h (401 `MFA_REQUIRED` otherwise). Shorter limits are enforced by middleware (04a §5.3). Remember-me is off in R1 and the checkbox is removed.
7. **MFA.** TOTP mandatory for platform staff in R1; secret stored application-encrypted in `mfa_totp_secret_enc`; `mfa_last_used_step` refuses replayed codes; OTP inputs use `autocomplete="one-time-code"` and accept paste. Optional owner MFA is R2 (FR-IAM-008).
8. **Passwords.** scrypt from the existing `config/hash.ts` (cost 16384 [Verified-repo]; re-benchmarked in M1). Length 10–128 characters [A-22]; paste and password managers allowed. Login rethrows non-credential errors to the exception handler (ADR-0018).
9. **Throttling** with the limiter database store; initial values [A-24] such as login 5/min per account+IP with `penalize()` on failure. The table is owned by [06](../06-api-design.md).

## Alternatives considered

| Alternative                               | Why rejected                                                                                                                                                                                          |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the cookie session store             | No server-side revocation (RF-04), no tagging, about 4 KB limit with silent truncation.                                                                                                               |
| Redis session store                       | Another stateful service; managed Valkey starts at $15.00/month as published on 2026-09-25 (https://docs.digitalocean.com/products/databases/valkey/details/pricing/). PostgreSQL handles R1 volumes. |
| Stateless JWT in the browser              | Revocation still needs a server-side denylist; JS-readable storage exposes the token to XSS; Inertia already relies on cookie sessions.                                                               |
| Hosted identity provider (Auth0, Clerk)   | Recurring cost, another processor subject to VX-09, awkward Nepal-specific flows (phone format, R2 SMS OTP).                                                                                          |
| Session tagging only, no `security_stamp` | Correctness would rest on the untested tag-after-regenerate order and on a job running; the stamp check is one comparison on a row already loaded.                                                    |

## Consequences

**Positive**

- Suspension, password change and "log out everywhere" take effect on the next request (T-SEC-010).
- Framework fixation protection; CSRF unchanged; no new infrastructure.

**Negative**

- Every authenticated request reads and writes a session row and reads the user row, from the 8-connection web pool ([03 §3.4](../03-system-architecture.md#34-postgresql-layout-and-connection-budget)).
- A database reader could copy a live session ID; `data` is not encrypted. Mitigation: restricted runtime role and `TRUNCATE sessions` in the incident runbook ([11](../11-deployment-and-operations.md)).

**Risks**

- _A route group misses the status middleware._ Mitigation: registered on every authenticated group and tested per surface.
- _Staff lockout after losing the TOTP device._ Mitigation: an audited admin MFA-reset procedure in [11](../11-deployment-and-operations.md) that rotates the stamp.

## When to revisit

- More than about 1 million live session rows, or session read p95 above 10 ms: consider the Redis store (pin @adonisjs/redis ^10; 11.0.0 breaks the session and limiter peer ranges [Verified-doc]).
- The R3 mobile app needs token auth (an opaque access-token guard): new ADR.
- R2 phone OTP (FR-IAM-010) or passkeys become practical for owners: revisit MFA factors.
- M1 metrics show customers re-logging in more than weekly: revisit A-23.

## Verification

- **T-SEC-010**: a suspended user's existing session is rejected on the next request (403 `ACCOUNT_SUSPENDED` for the API, redirect for pages).
- **T-IAM-109** (proposed, 04a §5.3): "log out everywhere" removes every tagged row and the old cookie is then rejected.
- **T-IAM suite** (proposed, [10](../10-testing-and-quality-gates.md)): new session ID at login; password change rejects other sessions only; login throttling (429 `RATE_LIMITED`); stale MFA gives 401 `MFA_REQUIRED`; cookie flags.
- **CSRF test** (proposed): an unsafe `/api/v1` request without `X-XSRF-TOKEN` is rejected; the payment webhook route is the only exemption (ADR-0012).

## Related

- [07 Security and threat model](../07-security-threat-model-and-permissions.md) · [03 §12.2 Authentication and sessions](../03-system-architecture.md#122-authentication-and-sessions-adr-0005) · [04a §5 Identity tables](../04a-data-dictionary-tables.md#5-identity-and-access-tables)
- [01 FR-IAM](../01-product-requirements.md#71-identity-and-accounts-fr-iam) · [06 API (rate limits)](../06-api-design.md)
- [ADR-0003](0003-inertia-ssr-storefront-csr-dashboards.md), [ADR-0006](0006-authorization-platform-roles-shop-memberships.md), [ADR-0010](0010-postgres-jobs-pg-boss-transactional-send.md), [ADR-0018](0018-error-contract-problem-details.md)
