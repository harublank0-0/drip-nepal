# Data Dictionary: Tables (§5–§15)

Status: Draft v1 (2026-09-25)

Reviewed: critic pass A4.2b (2026-09-25)

Audited: deep audit 2 (2026-09-30)

This file is the table-by-table part of the domain model. It shares section numbering with [04 Domain model and data dictionary](04-domain-model-and-data-dictionary.md), which owns the scope and reading guide ([04 §1](04-domain-model-and-data-dictionary.md)), modelling conventions ([04 §2](04-domain-model-and-data-dictionary.md)), key modelling decisions ([04 §3](04-domain-model-and-data-dictionary.md)), ER diagrams ([04 §4](04-domain-model-and-data-dictionary.md)), invariants ([04 §16](04-domain-model-and-data-dictionary.md)), the index summary ([04 §17](04-domain-model-and-data-dictionary.md)), money rules ([04 §18](04-domain-model-and-data-dictionary.md)), data classification and retention ([04 §19](04-domain-model-and-data-dictionary.md)), the migration plan ([04 §20](04-domain-model-and-data-dictionary.md)) and reference data ([04 §21](04-domain-model-and-data-dictionary.md)). Read [04 §1.4](04-domain-model-and-data-dictionary.md) first: it defines the entry format every table below follows, the sensitivity classes and the lifecycle classes.

Editor notes for these sections are consolidated at the end of [04](04-domain-model-and-data-dictionary.md).

| Section | Module                  | Tables                                                                                                                                                                                                                                                                                           |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §5      | identity                | `users`, `user_tokens`, `sessions`, `platform_staff`, `user_addresses`                                                                                                                                                                                                                           |
| §6      | shops                   | `shops`, `shop_memberships`, `shop_invitations`, `shop_agreements`, `shop_review_decisions`, `shop_addresses`, `shop_payout_accounts`, `shop_categories`, `shop_category_assignments`, `slug_redirects`                                                                                          |
| §7      | catalog, media          | `categories`, `attributes`, `attribute_values`, `category_attributes`, `brands`, `products`, `product_attribute_values`, `product_option_axes`, `product_variants`, `variant_option_values`, `product_review_decisions`, `product_listings`, `media_assets`, `product_media`, `collections` (R2) |
| §8      | inventory               | `inventory_items`, `inventory_reservations`, `inventory_movements`                                                                                                                                                                                                                               |
| §9      | logistics               | `provinces`, `districts`, `local_levels`, `delivery_zones`, `delivery_zone_districts`, `shop_delivery_coverage`, `shop_shipping_rates`                                                                                                                                                           |
| §10     | cart                    | `carts`, `cart_items`                                                                                                                                                                                                                                                                            |
| §11     | orders                  | `orders`, `shop_orders`, `order_items`, `order_events`, `shipments`, `shipment_events`, `return_requests`, `return_items`                                                                                                                                                                        |
| §12     | payments                | `payments`, `payment_allocations`, `provider_events`, `refunds`, `refund_items`                                                                                                                                                                                                                  |
| §13     | ledger                  | `ledger_entries`, `payouts`, `payout_entries`, `vendor_remittances`, `ledger_adjustment_requests` (proposed)                                                                                                                                                                                     |
| §14     | notifications, platform | `support_cases`, `support_case_messages`, `notification_deliveries`                                                                                                                                                                                                                              |
| §15     | platform, audit         | `platform_settings`, `idempotency_keys`, `audit_logs`, `rate_limits`, pg-boss schema (`pgboss`)                                                                                                                                                                                                  |

---

## 5. Identity and access tables

Owned by the `identity` module ([03 §4.4](03-system-architecture.md)). Other modules read these tables only through `app/modules/identity/queries.ts`. Permission slugs and role maps are in [07](07-security-threat-model-and-permissions.md). Session timeouts and TOTP parameters are in [07](07-security-threat-model-and-permissions.md) and [ADR-0005](adr/0005-session-auth-server-side-revocation.md).

Two general notes for this section and the next two. First, a CHECK passes when its expression evaluates to NULL, not only when it is true [Verified-doc <https://www.postgresql.org/docs/18/ddl-constraints.html>]. Every CHECK below that must reject a missing value therefore tests `IS NOT NULL` explicitly; `CHECK (x IN ('a','b'))` alone lets a null `x` through. T-ARCH-015 (proposed) inserts, for each state-dependent CHECK, a row whose required column is null and expects SQLSTATE 23514. Second, on indexes: PostgreSQL does not index referencing columns automatically. An index on a foreign key column only speeds up joins and deletes of the referenced row. Reference rows (locations, categories, attributes) and users are never deleted, so foreign keys to them get an index only when a named query needs one.

### 5.1 `users`

**Module** `identity` · **Release** R1 (created in the R0 baseline) · **Shop scope** none · **Lifecycle** Entity · **Sensitivity** Personal; `phone_enc` Sensitive-personal; `password_hash`, `security_stamp`, `mfa_totp_secret_enc` Secret

One row per person. A customer, a seller and a staff member are the same kind of row; what they may do comes from `shops.owner_user_id`, `shop_memberships` and `platform_staff` ([04 §3.1](04-domain-model-and-data-dictionary.md), [04 §3.2](04-domain-model-and-data-dictionary.md)).

| Column                       | Type        | Null | Default                  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------- | ----------- | ---- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | uuid        | no   | `uuidv7()`               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `email`                      | citext      | no   | App                      | Login identifier. Trimmed and lower-cased before storage (RF-22). Replaced by the placeholder `deleted-<id>@anonymized.invalid` on anonymisation (`users_anonymized_check`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `email_verified_at`          | timestamptz | yes  |                          | Set by `confirmEmail`. Required for checkout and shop applications (FR-IAM-002)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `password_hash`              | text        | yes  | App                      | scrypt PHC string from the existing hash config. Null only when anonymised. The column is renamed from `password` [Verified-repo `database/migrations/1761885935168_create_users_table.ts:16`], so the model sets `passwordColumnName: 'passwordHash'` (today `'password'`, [Verified-repo `app/models/user.ts:14-17`]), and the schema rules give it `serializeAs: null`, which Lucid's default rules give only to a column named `password` ([04 §18.4](04-domain-model-and-data-dictionary.md)). `anonymizeUser` clears it with a query-builder `UPDATE` inside its transaction (`trx.from('users').where('id', id).update({ password_hash: null, … })`), never with `user.save()`: the `withAuthFinder` `beforeSave` hook hashes any dirty password column and would pass the null to scrypt, which throws [Verified-doc `@adonisjs/auth` 10.1.0 `build/src/mixins/lucid.js`] |
| `full_name`                  | text        | yes  | App                      | 1–100 characters, NFC. Null only when anonymised                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `phone_enc`                  | text        | yes  |                          | E.164 mobile number, encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)). Required before checkout (FR-CHK-001), checked by the action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `phone_hash`                 | bytea       | yes  |                          | HMAC-SHA256 blind index ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `phone_last4`                | char(4)     | yes  |                          | Masked display                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `phone_verified_at`          | timestamptz | yes  |                          | Phone OTP, R2 (FR-IAM-010). Always null in R1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `marketing_email_consent_at` | timestamptz | yes  |                          | Opt-in time. Null means no consent (FR-IAM-013, REG-26; Advertisement (Regulation) Act 2076 s10(1) [Verified-doc <https://lawcommission.gov.np/content/13398/ad--regulation--act-act--2076/>]; obligations [Verify-external VX-03])                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `marketing_sms_consent_at`   | timestamptz | yes  |                          | As above, for SMS (used from R2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `age_confirmed_at`           | timestamptz | yes  |                          | 18+ confirmation at signup [Assumption A-26; Open OD-24]                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `status`                     | text        | no   | `'pending_verification'` | Values in the CHECK below; what each state allows is in [07](07-security-threat-model-and-permissions.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `security_stamp`             | uuid        | no   | `gen_random_uuid()`      | Random (v4), not time-ordered. Copied into the session at login and compared on every request. Rotated on every event that [07 §3.3](07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision) lists: password change or reset, suspension, "revoke all sessions", staff role grant, change or revocation, MFA reset, account deletion request, and the 10th wrong password re-entry in 24 h (ADR-0005, T-SEC-010)                                                                                                                                                                                                                                                                                                                                                                                                                |
| `mfa_totp_secret_enc`        | text        | yes  |                          | TOTP secret, encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)). Written at `startTotpEnrollment`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `mfa_enabled_at`             | timestamptz | yes  |                          | Set at `confirmTotpEnrollment`. Required for platform staff (FR-IAM-007)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `mfa_last_used_step`         | bigint      | yes  |                          | Last accepted TOTP time step. A code whose step is not greater is refused, so an intercepted code cannot be replayed within its window                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `last_login_at`              | timestamptz | yes  |                          | Written by the `session_auth:login_succeeded` listener                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `deletion_requested_at`      | timestamptz | yes  |                          | Set by `requestAccountDeletion` (FR-IAM-009)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `anonymized_at`              | timestamptz | yes  |                          | Set by `anonymizeUser` ([04 §19.2](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `created_at`, `updated_at`   | timestamptz | no   | `now()`                  | `updated_at` by trigger ([04 §2.2](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Keys and constraints**

- `users_pkey PRIMARY KEY (id)`.
- `users_email_key UNIQUE (email)`. Case-insensitive through `citext`, which fixes IAM-14. It is not on the constraint allowlist: `signUp` catches its violation and answers the same 202 as a new signup, so a concurrent signup cannot reveal that an address is registered ([04 §16.5](04-domain-model-and-data-dictionary.md), [07 TM-09](07-security-threat-model-and-permissions.md#tm-09-account-recovery-abuse-and-enumeration)).
- `users_email_check CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(btrim(email::text)))`. The cast to `text` matters: `citext` equality would make `email = lower(email)` always true.
- `users_status_check CHECK (status IN ('pending_verification','active','suspended','deactivated','anonymized'))`.
- `users_full_name_check CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 1 AND 100)`.
- `users_identity_required_check CHECK (status = 'anonymized' OR (full_name IS NOT NULL AND password_hash IS NOT NULL))`. A null password can no longer produce the empty login response of MISSED-schema-integrity. The bootstrap command that invites the first administrator stores the hash of a random 32-byte secret nobody knows, then sends a password-reset token.
- `users_active_verified_check CHECK (status <> 'active' OR email_verified_at IS NOT NULL)`.
- `users_deactivated_check CHECK (status <> 'deactivated' OR deletion_requested_at IS NOT NULL)`.
- `users_phone_parts_check CHECK ((phone_enc IS NULL) = (phone_hash IS NULL) AND (phone_enc IS NULL) = (phone_last4 IS NULL))`: ciphertext, blind index and mask are written together or not at all.
- `users_phone_hash_check CHECK (phone_hash IS NULL OR octet_length(phone_hash) = 32)`; `users_phone_last4_check CHECK (phone_last4 ~ '^[0-9]{4}$')`.
- `users_mfa_check CHECK (mfa_enabled_at IS NULL OR mfa_totp_secret_enc IS NOT NULL)`.
- `users_phone_enc_check CHECK (phone_enc IS NULL OR phone_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')` and `users_mfa_totp_secret_enc_check` with the same pattern on `mfa_totp_secret_enc` (INV-25 of [04 §16.2](04-domain-model-and-data-dictionary.md)). The pattern is the ciphertext format of [04 §2.9](04-domain-model-and-data-dictionary.md): version, key id, 12-byte IV (16 base64url characters), ciphertext, 16-byte tag (22 characters). A plaintext phone number or TOTP secret cannot match it, so an action that forgets to encrypt fails with 23514 instead of storing plaintext. Every other `*_enc` column in this document has the same CHECK, named `<table>_<column>_check`. The cost is one regular-expression match per write of an encrypted column.
- `users_anonymized_check CHECK ((status = 'anonymized') = (anonymized_at IS NOT NULL) AND (status <> 'anonymized' OR (email::text = 'deleted-' || id::text || '@anonymized.invalid' AND full_name IS NULL AND password_hash IS NULL AND phone_enc IS NULL AND mfa_totp_secret_enc IS NULL AND marketing_email_consent_at IS NULL AND marketing_sms_consent_at IS NULL AND age_confirmed_at IS NULL)))`. An anonymised row cannot keep personal data by mistake (AC-FR-IAM-009-3), including the real email: an anonymisation that forgets to replace it fails with 23514. The placeholder (63 characters) passes `users_email_check`, and because it is derived from `id`, `data:replay-anonymizations` writes the same value again. `users_phone_parts_check` and `users_mfa_check` already force `phone_hash`, `phone_last4` and `mfa_enabled_at` to null with the columns above. The signup and email-change validators refuse an address in the reserved `anonymized.invalid` domain, so no live account can hold a placeholder and make a later anonymisation fail on `users_email_key`.
- `users_verified_phone_key UNIQUE (phone_hash) WHERE phone_verified_at IS NOT NULL` (partial unique index). It has no effect in R1, where no phone is verified. From R2 a verified phone belongs to one account, which phone OTP login needs. Unverified numbers may repeat, because families share phones and COD fraud review needs to see those clusters.
- Not expressible as a constraint: the phone format (`^\+9779[678]\d{8}$`, [04 §2.8](04-domain-model-and-data-dictionary.md)) is checked by the validator only, because the database sees ciphertext; `users_phone_enc_check` proves only that the value is ciphertext. This is the price of [04 §2.9](04-domain-model-and-data-dictionary.md).

**Indexes**

| Index                                                                                  | Query it serves                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users_email_key` (unique)                                                             | Login `WHERE email = ?` (auth finder); signup and invitation email match; admin exact-email search            |
| `users_phone_hash_idx ON (phone_hash) WHERE phone_hash IS NOT NULL`                    | COD fraud review "other accounts with this phone" and admin search by phone: `WHERE phone_hash = hmac(:e164)` |
| `users_deletion_queue_idx ON (deletion_requested_at, id) WHERE status = 'deactivated'` | Admin deletion-request queue, oldest first (AC-FR-IAM-009-1)                                                  |

The admin user list filtered by status or name is a sequential scan. That is acceptable up to about 100,000 users [Assumption]; past that, add a `pg_trgm` index on `full_name` rather than a guess now.

**Lifecycle and retention.** `signUp` inserts `pending_verification`. `confirmEmail` moves the user to `active`. Staff suspend and reinstate. `requestAccountDeletion` moves the user to `deactivated` and revokes sessions. `anonymizeUser` moves the user to `anonymized` once the blockers of AC-FR-IAM-009-2 are clear. Transitions are compare-and-set on `status` (the permitted user transitions and who may make them are in [07](07-security-threat-model-and-permissions.md)). The row is never deleted: `orders.customer_user_id`, `shops.owner_user_id` and many `*_by` columns reference it with `RESTRICT`. Personal fields are removed at anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)), and the row itself is kept as long as any record that references it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

Verified by T-IAM-104 (proposed; `Ram@x.com` then `ram@x.com` through `signUp`: both calls return the same 202 body, exactly one `users` row exists, and the holder receives the "account already exists" email), T-IAM-103 (proposed, [04 §2.9](04-domain-model-and-data-dictionary.md)) and T-IAM-106 (proposed; run through the real `anonymizeUser` action, anonymisation leaves the order history readable and passes `users_anonymized_check`).

### 5.2 `user_tokens`

**Module** `identity` · **Release** R1 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Secret (`token_hash`)

Single-use tokens for email verification, password reset and (proposed) the MFA enrolment window of platform staff ([07 §3.9](07-security-threat-model-and-permissions.md#39-mfa-totp-for-platform-staff)). Staff invitations have their own table (§6.3).

| Column        | Type        | Null | Default    | Notes                                                                                                                                                                           |
| ------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid        | no   | `uuidv7()` |                                                                                                                                                                                 |
| `user_id`     | uuid        | no   | App        |                                                                                                                                                                                 |
| `purpose`     | text        | no   | App        | `email_verification`, `password_reset` or `mfa_enrollment` (proposed, [07 §3.8](07-security-threat-model-and-permissions.md#38-email-verification-reset-and-invitation-tokens)) |
| `token_hash`  | bytea       | no   | App        | SHA-256 of the raw token (32 random bytes, base64url in the emailed link). The raw token is never stored                                                                        |
| `expires_at`  | timestamptz | no   | App        | 24 h for email verification, 1 h for password reset, 24 h for MFA enrolment (proposed) [Assumption; [07](07-security-threat-model-and-permissions.md) owns the values]          |
| `consumed_at` | timestamptz | yes  |            | Set when used, or when a newer token, a password change, an email change or another event of the Lifecycle paragraph below invalidates it                                       |
| `created_at`  | timestamptz | no   | `now()`    |                                                                                                                                                                                 |

**Keys and constraints**

- `user_tokens_pkey PRIMARY KEY (id)`; `user_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT`.
- `user_tokens_token_hash_key UNIQUE (token_hash)`; `user_tokens_token_hash_check CHECK (octet_length(token_hash) = 32)`.
- `user_tokens_purpose_check CHECK (purpose IN ('email_verification','password_reset','mfa_enrollment'))` (`mfa_enrollment` proposed, [07 §3.9](07-security-threat-model-and-permissions.md#39-mfa-totp-for-platform-staff)).
- `user_tokens_expiry_check CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')`.
- `user_tokens_live_key UNIQUE (user_id, purpose) WHERE consumed_at IS NULL` (partial): at most one usable token per purpose. Issuing a token first locks the user's row with `SELECT id FROM users WHERE id = :user_id FOR NO KEY UPDATE` (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering); `requestPasswordReset` takes it in its email lookup, `… WHERE email = :email FOR NO KEY UPDATE`), then sets `consumed_at` on the live token of that purpose and inserts the new one, in the same transaction. Concurrent issuers therefore queue, and the last one wins. Without the lock, the second of two concurrent issuers (two reset requests, a double-clicked resend) updates no row, cannot see the first one's new token and fails with 23505, a 500 that only an existing account can produce: the enumeration signal that AC-FR-IAM-004-1 and [07 TM-09](07-security-threat-model-and-permissions.md#tm-09-account-recovery-abuse-and-enumeration) forbid. `FOR NO KEY UPDATE` is enough: it conflicts with itself and with `FOR UPDATE`, but not with the `FOR KEY SHARE` lock that the foreign-key check of a concurrent insert referencing the user takes [Verified-doc <https://www.postgresql.org/docs/18/explicit-locking.html>]. Every transaction that writes a user's tokens takes the user's row first, by this lock or by writing the row (as `signUp` and a password change do), so the order is always `users`, then `user_tokens`: redemption reads the token's `user_id` by `token_hash` without a lock, locks that user's row, then runs the redeeming statement (Indexes below). Otherwise a redemption (token row, then `users`) and a concurrent issue (`users`, then the token row) could deadlock. The index is the backstop: a hit means a code path skipped the lock ([04 §16.5](04-domain-model-and-data-dictionary.md#165-when-a-backstop-fires)).
- A plain SHA-256 is enough here, unlike phone numbers ([04 §2.9](04-domain-model-and-data-dictionary.md)): the input has 256 bits of entropy, so the hash cannot be reversed by trying candidates.

**Indexes**

| Index                                        | Query it serves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_tokens_token_hash_key`                 | Redeem in one statement, after the user-row lock above: `UPDATE user_tokens SET consumed_at = now() WHERE token_hash = :h AND purpose = :purpose AND consumed_at IS NULL AND expires_at > now() RETURNING user_id`. `:purpose` is fixed by the operation (`email_verification` in `confirmEmail`, `password_reset` in `resetPassword`, `mfa_enrollment` in `confirmTotpEnrollment`), so a token of another purpose matches no row and is not consumed; `confirmTotpEnrollment` also adds `AND user_id = :actor` (the signed-in user), so another account's token matches no row and stays unconsumed ([07 §3.8](07-security-threat-model-and-permissions.md#38-email-verification-reset-and-invitation-tokens)). Two concurrent redemptions cannot both succeed |
| `user_tokens_live_key`                       | Invalidate before issuing, after the user-row lock: `UPDATE … SET consumed_at = now() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `user_tokens_expires_at_idx ON (expires_at)` | Purge: `DELETE FROM user_tokens WHERE expires_at < now() - interval '7 days'` in batches                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

**Lifecycle and retention.** Inserted by `signUp`, `resendEmailVerification` and `requestPasswordReset`; an `mfa_enrollment` token (proposed) by `setPlatformStaffRole` for an account without `mfa_enabled_at`, by `platform:create-admin` and by every MFA reset ([07 §3.9](07-security-threat-model-and-permissions.md#39-mfa-totp-for-platform-staff)). Consumed by `confirmEmail`, `resetPassword` and `confirmTotpEnrollment`. All live tokens of a user are consumed when the password or email changes, and at suspension or anonymisation; a live `mfa_enrollment` token also by `revokePlatformStaff` ([07 §3.8](07-security-threat-model-and-permissions.md#38-email-verification-reset-and-invitation-tokens)). Rows are hard-deleted 7 days after expiry by the daily `platform.retention_purge` job (proposed, [03 §9](03-system-architecture.md); [04 §19.3](04-domain-model-and-data-dictionary.md)). Verified by T-IAM-105 (proposed; concurrent redemption of one token: exactly one succeeds; two concurrent `requestPasswordReset` calls for one known email both return 202 and leave exactly one live token).

### 5.3 `sessions` (session store table)

**Module** `identity` (table written by `@adonisjs/session`) · **Release** R0 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Secret

The server-side session store required by ADR-0005. It replaces the cookie store, which cannot revoke sessions (RF-04). The migration comes from `node ace make:session-table`, and the configuration uses `stores.database()` with its default table name `sessions` [Verified-doc `@adonisjs/session` 8.1.0 `build/make/migration/sessions.stub` and `build/database-CuWB6hfN.js`, <https://registry.npmjs.org/@adonisjs/session/-/session-8.1.0.tgz>].

| Column       | Type         | Null | Default | Notes                                                                                                                                                                                                                                                                                                 |
| ------------ | ------------ | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`         | varchar(255) | no   | package | Session ID, the value the session cookie carries. The cookie value is HMAC-signed with `APP_KEY`, so the ID works as a session cookie only together with `APP_KEY` ([07 TM-30](07-security-threat-model-and-permissions.md#tm-30-database-backup-or-session-table-exposure)); still handled as Secret |
| `data`       | text         | no   | package | Session values serialised as a JSON message, including the per-session CSRF secret. **Not encrypted** by the database store                                                                                                                                                                           |
| `user_id`    | varchar(255) | yes  |         | Written by `session.tag(String(user.id))` after login and after every other regenerate of a signed-in session (Lifecycle below); text, not uuid                                                                                                                                                       |
| `expires_at` | timestamptz  | no   | package | Last write or touch plus 7 days (the store `age`) when the session has a signed-in user, or plus 2 h when it has none (Lifecycle below)                                                                                                                                                               |

**Keys and constraints**

- `sessions_pkey PRIMARY KEY (id)`, as generated by the stub. DripNepal adds no CHECKs or foreign keys: the package upserts rows (`ON CONFLICT (id) MERGE data, expires_at`), and a constraint it does not expect would turn a normal request into a 500. `user_id` is text because the package writes `String(userId)`, so it cannot reference `users (id)` anyway.
- What `data` may contain is fixed in code ([07 §3.2](07-security-threat-model-and-permissions.md#32-what-a-session-may-contain)): the authenticated user ID (`auth_web`), the `security_stamp` copy, `authenticated_at` for the absolute timeouts, `mfa_verified_at` (stored as `{ user_id, at }`, so one staff member's TOTP check never unlocks another account in the same browser), `seller_seen_at` and `admin_seen_at` for the seller and admin idle limits, the CSRF secret, flash messages and validation errors. Never an intended URL: sign-in redirects carry the destination as the `return_to` query parameter ([07 §3.2](07-security-threat-model-and-permissions.md#32-what-a-session-may-contain)), so a token path such as `/invitations/{token}` never enters this unencrypted column. Never cart contents (the cart is a table, §10.1), and no personal data beyond the user ID.

**Indexes** (both created by the stub)

| Index                 | Query it serves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| index on `user_id`    | `SessionCollection.tagged(userId)`: `SELECT id, data FROM sessions WHERE user_id = ? AND expires_at > now()`, used by the job `identity.revoke_sessions` ([03 §9](03-system-architecture.md)) after "log out everywhere", suspension, password change and the other stamp rotations: it destroys every tagged row except one holding the user's current `security_stamp`, which after a password change or "log out everywhere" is the acting session ([07 §3.3](07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision)) |
| index on `expires_at` | Garbage collection: after a write, with probability `gcProbability` (default 2%), `DELETE FROM sessions WHERE expires_at <= now()`; the hourly `identity.purge_sessions` job (proposed) deletes expired rows in batches of 1,000                                                                                                                                                                                                                                                                                                                                            |

**Lifecycle and retention.** One row per browser session. Login regenerates the ID, so the row is re-keyed, and the tag is applied after `login()`: a tag set before it would stay on the ID that `login()` destroys. The same holds for every other `session.regenerate()` of a signed-in session: the `rotateSessionId` helper re-applies the tag after `verifyMfaChallenge`, `applyForShop`, `acceptShopInvitation` and `changePassword`, and only logout and forced logout regenerate without it ([07 §3.1](07-security-threat-model-and-permissions.md#31-guard-store-and-cookie); read from the `@adonisjs/session` 8.1.0 source, not yet run; M1 confirms it). The store is a thin wrapper over `stores.database()` ([07 §3.1](07-security-threat-model-and-permissions.md#31-guard-store-and-cookie)): its `write` gives data with `auth_web` (a signed-in user) the 7-day `age`, the longest idle period any user may have [Assumption A-23], and data without it a 2 h expiry, and its `touch` does the same by whether the row is tagged (`user_id` set). The shorter seller and admin idle limits are enforced by the `seller_context` and `platform_staff` middleware, and the 30-day absolute limit by the account-status middleware, from timestamps in `data`, because the store has one `age` for every signed-in session; [07 §3.4](07-security-threat-model-and-permissions.md#34-idle-and-absolute-timeouts-per-surface) owns the values and says what a missing timestamp means. It also proposes a 7-day absolute limit for staff sessions [Assumption]: counted from `authenticated_at` and checked by `platform_staff` on admin routes only, it ends in a full logout (401 `UNAUTHENTICATED`; sign in again with the password, then TOTP), separate from admin idle, which answers 401 `MFA_REQUIRED` and keeps the session. Expired rows are deleted by the hourly `identity.purge_sessions` job (proposed, [07 §3.1](07-security-threat-model-and-permissions.md#31-guard-store-and-cookie), not yet in [03 §9](03-system-architecture.md#9-asynchronous-work)) as well as by the package's garbage collection.

**Tradeoff.** A database reader who also has `APP_KEY` can turn a live session ID from `sessions.id` into a signed cookie and act as that user ([07 TM-30](07-security-threat-model-and-permissions.md#tm-30-database-backup-or-session-table-exposure)). The mitigations are the runtime role and backups being the only access paths ([07](07-security-threat-model-and-permissions.md)) and short idle limits for privileged surfaces. After any suspected database leak, the incident runbook ([11](11-deployment-and-operations.md)) runs `TRUNCATE sessions`, which logs everyone out. Verified by T-SEC-010 and T-IAM-109 (proposed; "log out everywhere" removes every tagged row except the acting session's, which holds the new stamp ([07 §3.3](07-security-threat-model-and-permissions.md#33-the-per-request-account-check-and-the-suspension-decision)), including an MFA-verified staff session, whose tag `rotateSessionId` re-applied; the old cookie is then rejected).

### 5.4 `platform_staff`

**Module** `identity` · **Release** R1 · **Shop scope** none · **Lifecycle** Configuration (never hard-deleted) · **Sensitivity** Internal

Which users are DripNepal staff and with which fixed role ([07](07-security-threat-model-and-permissions.md), ADR-0006). Absence of a row means "not staff".

| Column                     | Type        | Null | Default | Notes                                                                                                                                                      |
| -------------------------- | ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_id`                  | uuid        | no   | App     | Primary key; one row per person                                                                                                                            |
| `role`                     | text        | no   | App     | `platform_admin`, `support_agent`, `catalog_moderator`, `finance_officer`. Permission maps are in code ([07](07-security-threat-model-and-permissions.md)) |
| `granted_by`               | uuid        | yes  |         | Null only for the production bootstrap command `platform:create-admin` (FR-ADM-005)                                                                        |
| `granted_at`               | timestamptz | no   | `now()` | Reset when a revoked person is granted again                                                                                                               |
| `revoked_at`               | timestamptz | yes  |         | Null means active                                                                                                                                          |
| `revoked_by`               | uuid        | yes  |         |                                                                                                                                                            |
| `created_at`, `updated_at` | timestamptz | no   | `now()` | `updated_at` by trigger ([04 §2.2](04-domain-model-and-data-dictionary.md))                                                                                |

**Keys and constraints**

- `platform_staff_pkey PRIMARY KEY (user_id)`; `platform_staff_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT`; `platform_staff_granted_by_fkey` and `platform_staff_revoked_by_fkey` to `users (id) ON DELETE RESTRICT`.
- `platform_staff_role_check CHECK (role IN ('platform_admin','support_agent','catalog_moderator','finance_officer'))`.
- `platform_staff_self_grant_check CHECK (granted_by IS NULL OR granted_by <> user_id)`: nobody grants themselves a role.
- `platform_staff_revocation_check CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))`.
- Application-enforced: at least one active `platform_admin` must remain, counting only `platform_admin` rows with `revoked_at` null whose `users.status = 'active'` ([07 §3.12](07-security-threat-model-and-permissions.md#312-user-status-transitions)). `setPlatformStaffRole`, `revokePlatformStaff` and `requestAccountDeletion` by a platform admin lock all active admin rows (`SELECT user_id FROM platform_staff WHERE role = 'platform_admin' AND revoked_at IS NULL FOR UPDATE`) and then count in a second statement, whose new snapshot sees the changes the lock waited for; a deletion request that would leave none gets 409 `CONFLICT`. Each of the three takes this admin-row lock as its first row lock, before it writes any `users` row (stamp rotation, deactivation) or `user_tokens` row, so the order is always `platform_staff` admin rows, then `users`, then `user_tokens`. So two admins cannot demote each other, or both request deletion, at the same moment. T-IAM-110 (proposed) covers concurrent demotions, concurrent deletion requests by two admins, and a revoke concurrent with the revoker's own deletion request. Staff without `users.mfa_enabled_at` cannot reach `/admin` (FR-IAM-007); that is a session check, not a constraint.

**Indexes.** The primary key serves the per-request staff check `WHERE user_id = ? AND revoked_at IS NULL`. The staff list reads the whole table (fewer than 20 rows).

**Lifecycle and retention.** One row per person, updated in place when the role changes or access is revoked. Every change writes an `audit_logs` row, which is where role history lives. Rows are kept while the user row exists ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 5.5 `user_addresses`

**Module** `identity` · **Release** R1 · **Shop scope** none (user-scoped) · **Lifecycle** Configuration · **Sensitivity** Sensitive-personal

The customer's address book. Checkout copies the chosen address into `orders.shipping_address` (§11.1), so orders never reference this table. Editing or archiving an address therefore cannot change or delete an order, which fixes RF-06 and the address IDOR of MISSED-schema-integrity.

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                           |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                 |
| `user_id`                  | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                 |
| `label`                    | text        | yes  |            | "Home", "Office"; at most 30 characters                                                                                                                                                                                                                                                         |
| `recipient_name_enc`       | text        | no   | App        | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                   |
| `recipient_phone_enc`      | text        | no   | App        | Encrypted E.164 mobile. The same number may appear on addresses of different users (AC-FR-IAM-012-3; fixes RF-11)                                                                                                                                                                               |
| `recipient_phone_last4`    | char(4)     | no   | App        | Masked display in lists                                                                                                                                                                                                                                                                         |
| `province_code`            | text        | no   | App        | Reference to §9.1                                                                                                                                                                                                                                                                               |
| `district_code`            | text        | no   | App        | Reference to §9.2                                                                                                                                                                                                                                                                               |
| `local_level_code`         | text        | no   | App        | Nepal Post 5-digit local-level code, reference to §9.3 [Verify-external VX-10]                                                                                                                                                                                                                  |
| `ward_no`                  | smallint    | no   | App        | 1 to the local level's `ward_count`                                                                                                                                                                                                                                                             |
| `area_tole_enc`            | text        | no   | App        | Area or tole, encrypted                                                                                                                                                                                                                                                                         |
| `street_landmark_enc`      | text        | yes  |            | Street and landmark, encrypted                                                                                                                                                                                                                                                                  |
| `postal_code`              | text        | no   | generated  | `GENERATED ALWAYS AS (local_level_code \|\| lpad(ward_no::text, 2, '0')) STORED`: the 7-digit Nepal Post ward code, 5-digit local-level code plus 2-digit ward [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/Postal%20Code_wteggid.pdf>]. Derived, so users are never asked for it |
| `is_default`               | boolean     | no   | `false`    |                                                                                                                                                                                                                                                                                                 |
| `archived_at`              | timestamptz | yes  |            | Set by `deleteAddress`                                                                                                                                                                                                                                                                          |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                 |

The generated column is declared `STORED` explicitly, because PostgreSQL 18 makes generated columns `VIRTUAL` by default, and its expression may use only immutable functions [Verified-doc <https://www.postgresql.org/docs/18/ddl-generated-columns.html>]. Application code never assigns it. If an assignment slips in, PostgreSQL rejects the write, because a generated column cannot be written to [Verified-doc same page], so the mistake fails in tests instead of storing a wrong code.

**Keys and constraints**

- `user_addresses_pkey PRIMARY KEY (id)`; `user_addresses_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT`.
- Location chain ([04 §2.5](04-domain-model-and-data-dictionary.md)): `user_addresses_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT`; `user_addresses_district_fkey FOREIGN KEY (district_code, province_code) REFERENCES districts (code, province_code) ON DELETE RESTRICT`; `user_addresses_local_level_fkey FOREIGN KEY (local_level_code, district_code) REFERENCES local_levels (code, district_code) ON DELETE RESTRICT`. A district from one province and a local level from another cannot be stored (RF-29). T-IAM-108 (proposed) expects 23503, mapped to 422.
- `user_addresses_ward_no_check CHECK (ward_no BETWEEN 1 AND 40)`. The largest local level has 33 wards [Verified-doc Nepal Post list above]. The exact upper bound per local level is checked by the action against `local_levels.ward_count` (AC-FR-IAM-012-2), because a CHECK cannot read another table.
- `user_addresses_label_check CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30)`; `user_addresses_recipient_phone_last4_check CHECK (recipient_phone_last4 ~ '^[0-9]{4}$')`.
- Ciphertext format CHECKs (INV-25, pattern as `users_phone_enc_check` in §5.1): `user_addresses_recipient_name_enc_check`, `user_addresses_recipient_phone_enc_check`, `user_addresses_area_tole_enc_check` and `user_addresses_street_landmark_enc_check` (the last allows null).
- `user_addresses_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL))`.
- `user_addresses_one_default_key UNIQUE (user_id) WHERE is_default AND archived_at IS NULL` (partial): at most one default (fixes A1-12). Making an address the default (`createAddress` or `updateAddress` with `is_default = true`) clears the old default and then sets the new one in one transaction ([04 §16.3](04-domain-model-and-data-dictionary.md#163-constraint-sql), INV-17). Under the user-row lock below, a hit on this index means a code path skipped the lock ([04 §16.5](04-domain-model-and-data-dictionary.md#165-when-a-backstop-fires)).
- Application-enforced: a user with at least one active address has exactly one default, and at most 10 active addresses [Assumption] (AC-FR-IAM-012-4). Every address write (`createAddress`, `updateAddress`, `deleteAddress`) first locks the user's row with `SELECT id FROM users WHERE id = :user_id FOR NO KEY UPDATE`, the lock of §5.2 (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering), with no level 1–8 lock after it), so one user's address writes queue. Without it, the second of two concurrent "make default" requests fails with 23505 ([04 §16.3](04-domain-model-and-data-dictionary.md#163-constraint-sql)), and two concurrent creations could both pass the 10-address count or both become the first address. Under the lock, the target address of `updateAddress` or `deleteAddress` is loaded with `WHERE id = :address_id AND user_id = :user_id AND archived_at IS NULL` (404 `NOT_FOUND` otherwise); the user's first active address becomes the default whatever `is_default` says; `deleteAddress` of the default clears `is_default`, archives the row and, in the same transaction, makes the most recently created remaining active address the default; `updateAddress` with `is_default = false` on the current default is refused with 422 `VALIDATION_FAILED` on `is_default`, because the default moves only when another address is made the default. Checkout loads the address with `WHERE id = :address_id AND user_id = :auth_user_id AND archived_at IS NULL`, never by ID alone; another user's or an archived `address_id` answers 404 `NOT_FOUND` (INV-03).
- T-IAM-107 (proposed): two concurrent "make default" requests both succeed and leave exactly one default, the last writer's; two concurrent first-address creations leave exactly one default; eleven concurrent creations by a user without addresses leave exactly 10 active addresses, and the eleventh gets 422; archiving the default promotes the newest remaining active address; a concurrent archive and "make default" leave exactly one default; `is_default = false` on the default is refused.

**Indexes**

| Index                                                                               | Query it serves                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `user_addresses_user_active_idx ON (user_id, created_at) WHERE archived_at IS NULL` | Address book and checkout picker: `WHERE user_id = ? AND archived_at IS NULL ORDER BY is_default DESC, created_at` |
| `user_addresses_one_default_key`                                                    | Default lookup for the checkout quote                                                                              |
| `user_addresses_archived_idx ON (archived_at) WHERE archived_at IS NOT NULL`        | Purge of archived rows after the grace period                                                                      |

The location foreign keys get no index: reference rows are never deleted.

**Lifecycle and retention.** Created and edited in place by the address endpoints; placed orders are unaffected because they hold a snapshot. `deleteAddress` sets `archived_at`; archiving the default promotes another active address (Keys and constraints above). Archived rows are hard-deleted after 30 days [Assumption] by the daily `platform.retention_purge` job (proposed, [03 §9](03-system-architecture.md)), which leaves a short window for support questions about a just-removed address. All of a user's addresses are hard-deleted at anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)). Retention is set in [04 §19.3](04-domain-model-and-data-dictionary.md).

---

## 6. Shops and memberships

Owned by the `shops` module ([03 §4.4](03-system-architecture.md)). Shop status transitions are in [05 §6.10](05-order-payment-and-inventory-lifecycles.md). The seller authorization algorithm and the status gates (what a `suspended` or `closed` shop's members may still do) are in [07](07-security-threat-model-and-permissions.md). Every write in this section also writes an `audit_logs` row (§15.3).

### 6.1 `shops`

**Module** `shops` · **Release** R1 · **Shop scope** is the tenant root · **Lifecycle** Entity · **Sensitivity** Public (name, slug, description, logo, banner, shop contact, return policy); Personal (business identity and grievance contact of individual sellers); Sensitive-personal (`grievance_contact_phone_enc`); Financial (`pan_vat_number`, `is_vat_registered`, `commission_rate_bp`)

One row per shop, from application to closure. The application fields required by E-Commerce Act 2081 s16 (seller contract, registration evidence, PAN or VAT, grievance mechanism, return policy [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; VX-02]) are columns here. The contract acceptance is in `shop_agreements` (§6.4) and the documents are `media_assets` rows of kind `kyc_document` (§7.13).

| Column                            | Type        | Null | Default            | Notes                                                                                                                                                                                     |
| --------------------------------- | ----------- | ---- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                              | uuid        | no   | `uuidv7()`         |                                                                                                                                                                                           |
| `owner_user_id`                   | uuid        | no   | App                | The single source of ownership ([04 §3.1](04-domain-model-and-data-dictionary.md))                                                                                                        |
| `name`                            | text        | no   | App                | 2–60 characters. Not unique (fixes IAM-08); the slug is the identifier                                                                                                                    |
| `slug`                            | citext      | no   | App                | [04 §2.8](04-domain-model-and-data-dictionary.md) pattern and reserved-word list. Changed by staff only (FR-SHOP-012)                                                                     |
| `status`                          | text        | no   | `'pending_review'` | CHECK below; transitions in [05 §6.10](05-order-payment-and-inventory-lifecycles.md)                                                                                                      |
| `suspension_mode`                 | text        | yes  |                    | `fulfill_existing` or `frozen`; set exactly when suspended                                                                                                                                |
| `product_review_mode`             | text        | no   | `'pre'`            | `pre` or `post` [Assumption A-19; Open OD-20]. Staff-only                                                                                                                                 |
| `commission_rate_bp`              | int         | yes  |                    | Null means the platform default `default_commission_rate_bp` (§15.1). Snapshotted per order line (§11.3)                                                                                  |
| `contact_email`                   | text        | no   | App                | Public shop contact, lower-cased. Entered separately, never copied from the owner (AC-FR-SHOP-001-4)                                                                                      |
| `contact_phone_e164`              | text        | no   | App                | Public business number, mobile or landline ([04 §2.8](04-domain-model-and-data-dictionary.md)). Plaintext because it is published                                                         |
| `description`                     | text        | yes  |                    | Up to 2,000 characters                                                                                                                                                                    |
| `logo_media_id`                   | uuid        | yes  |                    | `media_assets` row of kind `shop_logo`                                                                                                                                                    |
| `banner_media_id`                 | uuid        | yes  |                    | Kind `shop_banner`                                                                                                                                                                        |
| `return_policy_text`              | text        | no   | App                | Shop's return terms shown on product pages next to the platform policy (AC-FR-CAT-012-2); up to 5,000 characters                                                                          |
| `business_type`                   | text        | no   | App                | `individual` or `registered_business`                                                                                                                                                     |
| `business_registration_number`    | text        | yes  |                    | Required for `registered_business`                                                                                                                                                        |
| `business_registration_authority` | text        | yes  |                    | For example the Office of the Company Registrar; required for `registered_business`                                                                                                       |
| `pan_vat_number`                  | text        | yes  |                    | Digits only. Required for `registered_business`; for `individual` it depends on OD-16 and VX-05. The validator requires 9 digits; the IRD format is not confirmed [Verify-external VX-05] |
| `is_vat_registered`               | boolean     | no   | `false`            | Determines who may show VAT on invoices (OD-11, OD-26)                                                                                                                                    |
| `grievance_contact_name`          | text        | yes  | App                | Seller's grievance contact (s16). Required until the retention redaction (`shops_grievance_contact_check`)                                                                                |
| `grievance_contact_phone_enc`     | text        | yes  | App                | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)). Required until the retention redaction, as above                                                                           |
| `personal_data_redacted_at`       | timestamptz | yes  |                    | Set by the retention redaction of a `closed` or `rejected` shop ([04 §19.3](04-domain-model-and-data-dictionary.md)); null while the grievance contact is held                            |
| `submitted_at`                    | timestamptz | no   | `now()`            | Set at application and at each resubmission; orders the review queue                                                                                                                      |
| `approved_at`                     | timestamptz | yes  |                    | First approval                                                                                                                                                                            |
| `approved_by`                     | uuid        | yes  |                    | Staff user                                                                                                                                                                                |
| `closed_at`                       | timestamptz | yes  |                    | Set by `closeShop` (proposed), the only R1 path to `closed`; starts the retention clocks of [04 §19.3](04-domain-model-and-data-dictionary.md)                                            |
| `version`                         | int         | no   | `1`                | Optimistic concurrency ([04 §2.10](04-domain-model-and-data-dictionary.md))                                                                                                               |
| `created_at`, `updated_at`        | timestamptz | no   | `now()`            |                                                                                                                                                                                           |

**Keys and constraints**

- `shops_pkey PRIMARY KEY (id)`; `shops_owner_user_fkey FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT`; `shops_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE RESTRICT`.
- `shops_logo_media_fkey FOREIGN KEY (logo_media_id, id) REFERENCES media_assets (id, shop_id) ON DELETE RESTRICT` and `shops_banner_media_fkey` likewise. These are the nullable composite references of [04 §2.5](04-domain-model-and-data-dictionary.md): another shop's image is rejected, and no logo is fine. `shops` and `media_assets` reference each other, so the baseline creates `shops`, then `media_assets`, then adds these two keys with `ALTER TABLE` ([04 §20.2](04-domain-model-and-data-dictionary.md)). That the asset is of the right kind and `ready` is checked by `updateShopProfile`.
- `shops_slug_key UNIQUE (slug)`; `shops_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')`: 3–40 characters, per AC-FR-SHOP-001-3 of [01](01-product-requirements.md) and [04 §2.8](04-domain-model-and-data-dictionary.md). The reserved-word list is in code ([04 §2.8](04-domain-model-and-data-dictionary.md)), because it grows with routes.
- `shops_name_check CHECK (char_length(name) BETWEEN 2 AND 60)`; `shops_description_check CHECK (description IS NULL OR char_length(description) <= 2000)`; `shops_return_policy_check CHECK (char_length(return_policy_text) BETWEEN 1 AND 5000)`; `shops_grievance_name_check CHECK (grievance_contact_name IS NULL OR char_length(grievance_contact_name) BETWEEN 2 AND 100)`.
- `shops_grievance_contact_check CHECK ((personal_data_redacted_at IS NULL AND grievance_contact_name IS NOT NULL AND grievance_contact_phone_enc IS NOT NULL) OR (personal_data_redacted_at IS NOT NULL AND status IN ('closed','rejected') AND grievance_contact_name IS NULL AND grievance_contact_phone_enc IS NULL))`: a shop holds its grievance contact (s16) until the retention redaction of [04 §19.3](04-domain-model-and-data-dictionary.md), which only a `closed` or `rejected` shop can undergo; a redacted shop can never return to `pending_review` or `active`. `personal_data_redacted_at` is written only by the retention redaction and is never cleared, so the CHECK backstops the 409 of `resubmitShopApplication` (Lifecycle and retention). Tested on PostgreSQL 18.6: a shop without a contact, and the redaction of an `active` or `pending_review` shop, fail with 23514; the redaction of a `closed` or `rejected` shop passes, and resubmitting a redacted `rejected` shop fails, even with a new contact.
- `shops_status_check CHECK (status IN ('pending_review','active','rejected','suspended','closed'))`.
- `shops_suspension_mode_check CHECK ((status = 'suspended' AND suspension_mode IS NOT NULL AND suspension_mode IN ('fulfill_existing','frozen')) OR (status <> 'suspended' AND suspension_mode IS NULL))`.
- `shops_product_review_mode_check CHECK (product_review_mode IN ('pre','post'))`.
- `shops_commission_rate_bp_check CHECK (commission_rate_bp IS NULL OR commission_rate_bp BETWEEN 0 AND 10000)`.
- `shops_contact_email_check CHECK (char_length(contact_email) BETWEEN 3 AND 254 AND contact_email = lower(contact_email))`; `shops_contact_phone_check CHECK (contact_phone_e164 ~ '^\+977(9[678][0-9]{8}|[0-9]{8})$')`.
- `shops_business_type_check CHECK (business_type IN ('individual','registered_business'))`.
- `shops_registered_business_check CHECK (business_type <> 'registered_business' OR (business_registration_number IS NOT NULL AND business_registration_authority IS NOT NULL AND pan_vat_number IS NOT NULL))`.
- `shops_pan_vat_number_check CHECK (pan_vat_number IS NULL OR pan_vat_number ~ '^[0-9]{1,20}$')`. Deliberately looser than the validator, so that a confirmed IRD format (VX-05) is a validator change, not a migration.
- `shops_vat_requires_pan_check CHECK (NOT is_vat_registered OR pan_vat_number IS NOT NULL)`.
- `shops_approval_check CHECK (status IN ('pending_review','rejected') OR (approved_at IS NOT NULL AND approved_by IS NOT NULL))`: a shop can be active, suspended or closed only after an approval.
- `shops_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL))`.
- `shops_grievance_contact_phone_enc_check`: the ciphertext format CHECK of §5.1 (INV-25), allowing null (after the redaction above).
- Trigger `shops_require_agreement` (INV-18): a shop cannot be `active` unless at least one `shop_agreements` row exists for it. A CHECK cannot read another table, so this is a row trigger. `RAISE … USING CONSTRAINT` puts the name `shops_agreement_required` into the error [Verified-doc <https://www.postgresql.org/docs/18/plpgsql-errors-and-messages.html>], so logs and alerts name it. `approveShopApplication` refuses a shop without an agreement first (422, AC-FR-SHOP-002-2), so the trigger is a backstop: it is not on the constraint allowlist and a violation answers 500 `INTERNAL` with an alert ([04 §16.5](04-domain-model-and-data-dictionary.md)). Which agreement versions are still accepted stays an action check, because the version list is code (§6.4). Agreement rows are append-only and deleted only by the retention command 7 years after a shop is `closed` (§6.4), a status the shop never leaves, so the trigger cannot be defeated by a later delete. An `active` shop cannot be inserted directly, because its agreement row needs the shop row first: factories and seeders insert `pending_review`, then the agreement, then update to `active` ([04 §20.3](04-domain-model-and-data-dictionary.md)). T-SHOP-102 (proposed).

```sql
CREATE OR REPLACE FUNCTION shops_require_agreement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM shop_agreements a WHERE a.shop_id = NEW.id) THEN
    RAISE EXCEPTION 'shop % cannot be active without an accepted seller agreement', NEW.id
      USING ERRCODE = '23514', CONSTRAINT = 'shops_agreement_required';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER shops_require_agreement
  BEFORE INSERT OR UPDATE OF status ON shops
  FOR EACH ROW WHEN (NEW.status = 'active')
  EXECUTE FUNCTION shops_require_agreement();
```

- Application-enforced, because they need other tables: approval requires an agreement row for a version the platform still accepts (the trigger above only proves that some agreement exists), the KYC documents required by OD-16, an active default pickup address, and delivery coverage with rates (AC-FR-SHOP-002-2); the shop-count limit, checked by `applyForShop` and by `resubmitShopApplication` when it moves a shop `rejected → pending_review`, both under the owner's `users` row lock ([04 §3.1](04-domain-model-and-data-dictionary.md)); a shop slug may not equal an `old_slug` in `slug_redirects` held by another shop (§6.10). The application review lists every shop in any status, including `rejected`, `suspended` and `closed`, that has the same owner or the application's `pan_vat_number`, `business_registration_number`, `contact_phone_e164` or `contact_email`, or the owner's `phone_hash` when present; approving an application with such a match requires a written `note` on `approveShopApplication` (proposed), kept in the `shop.approve` audit entry, never in the applicant-visible `shop_review_decisions.reason` ([07 TM-31](07-security-threat-model-and-permissions.md#tm-31-fraudulent-vendor-onboarding-and-counterfeit-listings)). Verified by T-SHOP-110 (the approval checks, including the repeat-seller match, the required `note` and where it is stored), T-SHOP-104 and T-SHOP-106 (all proposed).

**Indexes**

| Index                                        | Query it serves                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shops_slug_key` (unique)                    | Seller context resolution on every `/seller/{shopSlug}` and `/api/v1/seller/shops/{shopSlug}` request; public shop page `/shops/{shopSlug}`                                       |
| `shops_owner_idx ON (owner_user_id, status)` | Shop switcher (owned shops), the `max_shops_per_owner` count `WHERE owner_user_id = ? AND status IN ('pending_review','active','suspended')`, and the anonymisation blocker check |

The admin application queue (`WHERE status = 'pending_review' ORDER BY submitted_at`) and shop list read fewer than 50 rows at launch (Q1) and get no index. Revisit above 5,000 shops.

**Lifecycle and retention.** `applyForShop` inserts the row with `pending_review`, together with the agreement row, the default pickup address (§6.6) and the category assignments from `shop_category_codes` (§6.9; proposed input), in one transaction. Staff decisions change `status` by compare-and-set `WHERE id = ? AND status = :from AND version = :v`, so two reviewers deciding at once produce one success and one 409 (AC-FR-SHOP-002-5). Each decision appends a `shop_review_decisions` row. Closure is admin-only in R1 (owner closure, FR-SHOP-008, is R2): `closeShop` (proposed; [06 §13.8](06-api-design.md)), `POST /api/v1/admin/shops/{shopId}/close` with `platform.shops.suspend` and a `reason`, locks the shop row `FOR UPDATE` (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)), checks the preconditions of [05 §6.10](05-order-payment-and-inventory-lifecycles.md) (no non-terminal shop order; no open return request (`requested`, `approved`, `in_transit`, `received`) and no open refund (`requested`, `approved`, `processing`, `failed`, `needs_review`) on any of its shop orders; a zero balance or a recorded settlement [Assumption]), compare-and-sets `active` or `suspended` to `closed` with `closed_at = now()` and `suspension_mode = NULL` (`shops_suspension_mode_check`), revokes every open invitation of the shop (§6.3) and writes the audit row `shop.close` (proposed), all in one transaction. Checkout reads the shop's status without a lock ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step) step 4), so a checkout that read the shop as `active` before the closure committed can still commit a shop order after it; the 15-minute acceptance sweeper of [05 §8.11](05-order-payment-and-inventory-lifecycles.md#811-vendor-acceptance-timeout) cancels open shop orders of a `closed` shop with `shop_frozen`, as for a frozen shop. A shop is never deleted: orders, ledger entries and payouts reference it. A closed shop keeps its slug for good, so an old link never opens a different shop. The row and its business fields are kept at least as long as the shop's financial records: 7 years after `closed_at`, the approximation of "six years after the end of the fiscal year" in [04 §19.3](04-domain-model-and-data-dictionary.md) [Verify-external VX-08]. At the end of that period the retention command deletes the shop's configuration rows (§6.2, §6.6, §6.9, §9.6, §9.7) and redacts the grievance contact (`grievance_contact_name` and `grievance_contact_phone_enc` → null, `personal_data_redacted_at = now()`); the business identifiers stay with the financial records, and the row stays while any record references it. An application that is never approved has its own clock ([04 §19.3](04-domain-model-and-data-dictionary.md)): one year after its last rejection (the latest `rejected` row in `shop_review_decisions`, §6.5), the daily `platform.retention_purge` job (proposed, [03 §9](03-system-architecture.md)) deletes its `shop_addresses`, `shop_category_assignments`, `shop_delivery_coverage` and `shop_shipping_rates` rows, redacts the grievance contact in the same way and, for an individual applicant, sets `pan_vat_number`, `business_registration_number` and `business_registration_authority` to null with `is_vat_registered = false`; its `shop_agreements` and `shop_review_decisions` rows are kept as records, and its KYC files go in the same run (§7.13). The purge handles each application in one transaction: it locks the `shops` row `FOR UPDATE` (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)), re-checks `status = 'rejected'`, `personal_data_redacted_at IS NULL` and the 1-year clock, then deletes the four configuration tables and redacts the row (bumping `version`), so a concurrent `resubmitShopApplication` either commits first and the purge skips the shop, or fails its compare-and-set; the KYC step selects only applications with `personal_data_redacted_at` set. A purged application cannot be resubmitted: `resubmitShopApplication` answers 409 `INVALID_STATE_TRANSITION` when `personal_data_redacted_at` is set, and the owner applies again with a new shop (`shops_grievance_contact_check` is the backstop). A `rejected` shop does not block its owner's anonymisation and keeps pointing at the anonymised user ([04 §19.2](04-domain-model-and-data-dictionary.md)). Three transformers control exposure: public, member and admin views. The public one never includes `owner_user_id` or any business, tax or grievance field (AC-FR-SHOP-003-3, AC-FR-SHOP-013-4, RF-36).

### 6.2 `shop_memberships`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration (kept after removal) · **Sensitivity** Personal (links a person to a shop)

Staff access to a shop ([04 §3.2](04-domain-model-and-data-dictionary.md)). The owner has no row here.

| Column                     | Type        | Null | Default    | Notes                                                    |
| -------------------------- | ----------- | ---- | ---------- | -------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` | Used in `/members/{membershipId}` paths                  |
| `shop_id`                  | uuid        | no   | App        |                                                          |
| `user_id`                  | uuid        | no   | App        |                                                          |
| `role`                     | text        | no   | App        | `manager`, `catalog_editor`, `order_fulfiller`, `viewer` |
| `status`                   | text        | no   | `'active'` | `active` or `removed`                                    |
| `invited_by`               | uuid        | yes  |            | Null only for an admin-assisted repair                   |
| `removed_at`               | timestamptz | yes  |            |                                                          |
| `removed_by`               | uuid        | yes  |            |                                                          |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                          |

**Keys and constraints**

- `shop_memberships_pkey PRIMARY KEY (id)`; `shop_memberships_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT`; `shop_memberships_user_fkey`, `shop_memberships_invited_by_fkey` and `shop_memberships_removed_by_fkey` to `users (id) ON DELETE RESTRICT`.
- `shop_memberships_shop_user_key UNIQUE (shop_id, user_id)`: one row, hence one role, per user per shop (fixes IAM-13). A double invitation acceptance is harmless ([03 §7.6](03-system-architecture.md)).
- `shop_memberships_role_check CHECK (role IN ('manager','catalog_editor','order_fulfiller','viewer'))`. The list excludes `owner`, so the rule that the owner is never a membership row (ADR-0006) holds by construction.
- `shop_memberships_status_check CHECK (status IN ('active','removed'))`; `shop_memberships_removal_check CHECK ((status = 'removed') = (removed_at IS NOT NULL))`.
- Application-enforced: the owner cannot be invited or become a member (`inviteMember` and `acceptShopInvitation` compare with `shops.owner_user_id`); at most 20 active members per shop [Assumption, AC-FR-SHOP-005-4], counted after locking the shop row. `inviteMember` and `acceptShopInvitation` take that shop row lock before any invitation or membership row (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering); order in §6.3). T-SHOP-103 (proposed) covers the owner rule and T-SHOP-107 (proposed) the member limit.

**Indexes**

| Index                                                                   | Query it serves                                                                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_memberships_shop_user_key`                                        | Seller context resolution: `WHERE shop_id = ? AND user_id = ? AND status = 'active'` on every seller request after the owner check; member list `WHERE shop_id = ? ORDER BY created_at` |
| `shop_memberships_user_active_idx ON (user_id) WHERE status = 'active'` | Shop switcher and shared props, "shops where I am staff" (fixes RF-44)                                                                                                                  |

**Lifecycle and retention.** Created on invitation acceptance. A role change updates the row. Removal sets `status = 'removed'` and keeps the row, so a former member's past actions stay attributable (IAM-13). Re-inviting a removed member reactivates the same row. Role history is in `audit_logs`. Rows are kept while the shop is open and until 7 years after `closed_at`, when the retention command deletes them with the shop's other configuration rows ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 6.3 `shop_invitations`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Ephemeral (kept 1 year after acceptance, revocation or expiry) · **Sensitivity** Personal (`email`); Secret (`token_hash`)

Email invitations to join a shop ([03 §7.6](03-system-architecture.md), FR-SHOP-005).

| Column                | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `shop_id`             | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `email`               | citext      | no   | App        | Invitee, lower-cased. Must equal the accepting user's verified email. `anonymizeUser` replaces it with the user's placeholder in every row sent to the old email or accepted by the user ([04 §19.2](04-domain-model-and-data-dictionary.md))                                                                                                                                                                   |
| `role`                | text        | no   | App        | As `shop_memberships.role`                                                                                                                                                                                                                                                                                                                                                                                      |
| `token_hash`          | bytea       | no   | App        | SHA-256 of the 32-byte random token                                                                                                                                                                                                                                                                                                                                                                             |
| `expires_at`          | timestamptz | no   | App        | `created_at` + 7 days                                                                                                                                                                                                                                                                                                                                                                                           |
| `accepted_at`         | timestamptz | yes  |            |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `accepted_by_user_id` | uuid        | yes  |            |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `revoked_at`          | timestamptz | yes  |            | Revoked by the owner (`shop.staff.manage`), by a re-invite, or by `suspendShop` or `closeShop` (proposed), which revoke every open invitation of the shop in their transaction ([07 §4.4](07-security-threat-model-and-permissions.md#44-status-gating)); `anonymizeUser` also revokes open invitations to the user's old email before it replaces `email` ([04 §19.2](04-domain-model-and-data-dictionary.md)) |
| `invited_by`          | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `created_at`          | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Keys and constraints**

- `shop_invitations_pkey PRIMARY KEY (id)`; FKs to `shops (id)` and `users (id)` (`invited_by`, `accepted_by_user_id`), all `ON DELETE RESTRICT`.
- `shop_invitations_token_hash_key UNIQUE (token_hash)`; `shop_invitations_token_hash_check CHECK (octet_length(token_hash) = 32)`.
- `shop_invitations_role_check CHECK (role IN ('manager','catalog_editor','order_fulfiller','viewer'))`.
- `shop_invitations_email_check CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(email::text))`.
- `shop_invitations_outcome_check CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL) AND (accepted_at IS NULL) = (accepted_by_user_id IS NULL))`; `shop_invitations_expiry_check CHECK (expires_at > created_at)`.
- `shop_invitations_pending_key UNIQUE (shop_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL` (partial): one open invitation per address per shop. A partial index predicate cannot use `now()`, so an expired open invitation still counts; `inviteMember` revokes it first in the same transaction. Before that, `inviteMember` locks the shop row `FOR UPDATE` (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)), the lock its member and pending-invitation limits already need (§6.2), so two concurrent invitations of one address queue and the second replaces the first instead of failing with 23505. `acceptShopInvitation` keeps the same order: it finds the invitation's `shop_id` by `token_hash` without a lock (an unknown token answers 404 before any lock), locks the shop row, then locks the invitation row `FOR UPDATE` and re-checks `accepted_at IS NULL AND revoked_at IS NULL AND expires_at > now()`, `shops.status = 'active'` and the member limit (§6.2). `suspendShop` and `closeShop` (proposed) also lock the shop row first and then revoke the shop's open invitations, so an acceptance cannot deadlock with a re-invite of the same address or with a suspension or closure: an acceptance that waits on the shop row fails its status check once the suspension or closure commits.

**Indexes**

| Index                             | Query it serves                                                                                                                                                                           |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_invitations_token_hash_key` | `GET /invitations/{token}`: `WHERE token_hash = ?`; `acceptShopInvitation`: the same lookup without a lock, then `WHERE token_hash = ? … FOR UPDATE` after the shop row is locked (above) |
| `shop_invitations_pending_key`    | Pending list and the limit of 20 pending invitations: `WHERE shop_id = ? AND accepted_at IS NULL AND revoked_at IS NULL`                                                                  |

**Lifecycle and retention.** Accepted or revoked by compare-and-set on the two nullable timestamps. Unknown, expired, revoked and already-accepted tokens all return 404. Application code never deletes rows ([04 §2.6](04-domain-model-and-data-dictionary.md)). The daily `platform.retention_purge` job (proposed, [03 §9](03-system-architecture.md)) removes an invitation one year after it was accepted, revoked or expired [Assumption] ([04 §19.3](04-domain-model-and-data-dictionary.md)); the `audit_logs` rows record the event after that.

### 6.4 `shop_agreements`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal (`accepted_by_user_id`, `ip_hash`)

Evidence that the shop's owner accepted a version of the seller agreement, which E-Commerce Act 2081 s14 and s16 require before selling [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; VX-02] (FR-SHOP-013).

| Column                | Type        | Null | Default    | Notes                                                                                                                                                             |
| --------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                  | uuid        | no   | `uuidv7()` |                                                                                                                                                                   |
| `shop_id`             | uuid        | no   | App        |                                                                                                                                                                   |
| `agreement_version`   | text        | no   | App        | Effective date of the text, `YYYY-MM-DD`                                                                                                                          |
| `accepted_by_user_id` | uuid        | no   | App        | The owner at the time of acceptance                                                                                                                               |
| `accepted_at`         | timestamptz | no   | `now()`    |                                                                                                                                                                   |
| `ip_hash`             | bytea       | no   | App        | Keyed HMAC-SHA256 of the client IP, computed as for `audit_logs.ip_hash` (§15.3). Unkeyed hashing would be pointless: all IPv4 addresses can be hashed in minutes |
| `request_id`          | text        | no   | App        | Links to logs and the `audit_logs` row                                                                                                                            |

Agreement texts are versioned files in the repository (`resources/legal/seller-agreement/<version>.md`), listed with their effective and "accepted until" dates in `app/modules/shops/domain/seller_agreements.ts`. A new version is therefore reviewed like code, and `getCurrentSellerAgreement` serves the file. `applyForShop` must carry `accepted_agreement_version` equal to the current version (AC-FR-SHOP-013-1).

**Keys and constraints**

- `shop_agreements_pkey PRIMARY KEY (id)`; `shop_agreements_shop_fkey` to `shops (id)` and `shop_agreements_accepted_by_fkey` to `users (id)`, both `ON DELETE RESTRICT`.
- `shop_agreements_shop_version_key UNIQUE (shop_id, agreement_version)`: accepting the same version twice is a no-op (`ON CONFLICT DO NOTHING`).
- `shop_agreements_version_check CHECK (agreement_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')`; `shop_agreements_ip_hash_check CHECK (octet_length(ip_hash) = 32)`.
- Append-only: `REVOKE UPDATE, DELETE, TRUNCATE` from the runtime role plus the `forbid_mutation()` trigger ([04 §2.12](04-domain-model-and-data-dictionary.md)). T-ARCH-012 (proposed).
- Application-enforced: only the owner can accept, checked against `shops.owner_user_id` inside the transaction.

**Indexes.** `shop_agreements_shop_version_key` serves the publish and approval gate: `EXISTS (SELECT 1 FROM shop_agreements WHERE shop_id = ? AND agreement_version = ANY(:still_accepted_versions))` (AC-FR-SHOP-013-3).

**Lifecycle and retention.** One insert per shop per accepted version, never changed. Kept for the life of the shop plus 7 years after closure ([04 §19.3](04-domain-model-and-data-dictionary.md)) [Verify-external VX-08]: it is the contract behind the shop's sales; the retention command then deletes them through the retention exemption of `forbid_mutation()` (proposed, [04 §2.12](04-domain-model-and-data-dictionary.md)). An application that is never approved keeps its rows with its `shops` row, also after the 1-year purge of its other data (§6.1). The `shops_require_agreement` trigger (§6.1) reads this table when a shop becomes `active`.

### 6.5 `shop_review_decisions`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (the reason is shown to the applicant)

Staff decisions on a shop: application approval or rejection, suspension and reinstatement (AC-FR-SHOP-002-4, FR-SHOP-007). Closure (admin-only in R1, by `closeShop`, proposed, §6.1) is recorded in `audit_logs` only, as `shop.close` (proposed). The written `note` that approving a repeat-seller match requires (§6.1) is also kept only in the `shop.approve` audit entry, never in `reason`, which the applicant sees.

| Column            | Type        | Null | Default    | Notes                                                                 |
| ----------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------- |
| `id`              | uuid        | no   | `uuidv7()` |                                                                       |
| `shop_id`         | uuid        | no   | App        |                                                                       |
| `decision`        | text        | no   | App        | `approved`, `rejected`, `suspended`, `reinstated`                     |
| `reason`          | text        | yes  |            | Required for rejection and suspension; the applicant or owner sees it |
| `suspension_mode` | text        | yes  |            | Copy of the mode chosen, for suspension decisions                     |
| `decided_by`      | uuid        | no   | App        | Staff user                                                            |
| `created_at`      | timestamptz | no   | `now()`    |                                                                       |

**Keys and constraints**

- `shop_review_decisions_pkey PRIMARY KEY (id)`; FKs to `shops (id)` and `users (id)` (`decided_by`), `ON DELETE RESTRICT`.
- `shop_review_decisions_decision_check CHECK (decision IN ('approved','rejected','suspended','reinstated'))`.
- `shop_review_decisions_reason_check CHECK (decision NOT IN ('rejected','suspended') OR (reason IS NOT NULL AND char_length(reason) BETWEEN 20 AND 2000))` (AC-FR-SHOP-002-3).
- `shop_review_decisions_suspension_mode_check CHECK ((decision = 'suspended' AND suspension_mode IS NOT NULL AND suspension_mode IN ('fulfill_existing','frozen')) OR (decision <> 'suspended' AND suspension_mode IS NULL))`.
- Append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)). Application-enforced: `decided_by` must not be the shop's owner or a member of it, because staff may also sell.

**Indexes.** `shop_review_decisions_shop_idx ON (shop_id, created_at DESC)`: the latest rejection reason shown to the applicant, and the shop history in admin.

**Lifecycle and retention.** Written in the same transaction as the `shops.status` change it explains. Kept as long as the shop row ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 6.6 `shop_addresses`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration · **Sensitivity** Sensitive-personal (many sellers work from home)

Pickup and return addresses. The layout matches `user_addresses` (§5.5), so the same address form and validator serve both.

| Column                                               | Type        | Null | Default    | Notes                                                         |
| ---------------------------------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------- |
| `id`                                                 | uuid        | no   | `uuidv7()` |                                                               |
| `shop_id`                                            | uuid        | no   | App        |                                                               |
| `purpose`                                            | text        | no   | App        | `pickup` or `return`                                          |
| `label`                                              | text        | yes  |            | At most 30 characters                                         |
| `contact_name`                                       | text        | no   | App        | Person the courier asks for, 2–100 characters                 |
| `contact_phone_enc`                                  | text        | no   | App        | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)) |
| `province_code`, `district_code`, `local_level_code` | text        | no   | App        | As §5.5                                                       |
| `ward_no`                                            | smallint    | no   | App        | As §5.5                                                       |
| `area_tole_enc`                                      | text        | no   | App        | Encrypted                                                     |
| `street_landmark_enc`                                | text        | yes  |            | Encrypted                                                     |
| `postal_code`                                        | text        | no   | generated  | As §5.5                                                       |
| `is_default`                                         | boolean     | no   | `false`    | Default per purpose                                           |
| `archived_at`                                        | timestamptz | yes  |            |                                                               |
| `created_at`, `updated_at`                           | timestamptz | no   | `now()`    |                                                               |

**Keys and constraints**

- `shop_addresses_pkey PRIMARY KEY (id)`; `shop_addresses_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT`.
- The three location keys of §5.5, named `shop_addresses_province_fkey`, `shop_addresses_district_fkey` and `shop_addresses_local_level_fkey`.
- `shop_addresses_purpose_check CHECK (purpose IN ('pickup','return'))`; `shop_addresses_ward_no_check CHECK (ward_no BETWEEN 1 AND 40)`; `shop_addresses_contact_name_check CHECK (char_length(contact_name) BETWEEN 2 AND 100)`; `shop_addresses_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL))`.
- `shop_addresses_one_default_key UNIQUE (shop_id, purpose) WHERE is_default AND archived_at IS NULL` (partial; fixes A1-12).
- Ciphertext format CHECKs (INV-25, pattern of §5.1): `shop_addresses_contact_phone_enc_check`, `shop_addresses_area_tole_enc_check` and `shop_addresses_street_landmark_enc_check` (the last allows null).
- Application-enforced: approval needs a default pickup address; if no return address exists, returns go to the default pickup address. In R1 a shop has at most one active address per purpose, and it is the default of that purpose. `applyForShop` inserts the pickup address. `updateShopProfile` (`shop.profile.manage`) takes optional `pickup_address` and `return_address` objects with the §5.5 fields, and `resubmitShopApplication` a `pickup_address` (proposed inputs, [06 §13.4 and §13.5](06-api-design.md)); each updates the active row of that purpose in place, or inserts it as the default when there is none. A `return_address` of `null` archives the return address, so returns go to the default pickup address again. No operation archives the pickup address, so an approved shop (`active`, `suspended` or `closed`) keeps the default pickup address its approval required until the retention command deletes a closed shop's configuration rows, 7 years after `closed_at` (§6.1); the addresses of a never-approved application go in its 1-year purge (§6.1).

**Indexes.** `shop_addresses_shop_idx ON (shop_id, purpose) WHERE archived_at IS NULL` serves the settings page and the approval check. The partial unique index serves "default pickup address of this shop".

**Lifecycle and retention.** As §5.5, through the inputs above: edited in place; a removed return address is archived; archived rows are hard-deleted after 30 days [Assumption] by `platform.retention_purge` ([04 §19.3](04-domain-model-and-data-dictionary.md)). The same job deletes every address of an application that was never approved, one year after its last rejection (§6.1), and the retention command deletes a closed shop's addresses 7 years after `closed_at`, with its other configuration rows (§6.1).

### 6.7 `shop_payout_accounts`

**Module** `shops` · **Release** R1 (captured and verified), used for payouts from R1.1 · **Shop scope** shop · **Lifecycle** Configuration (replaced or retired, never deleted) · **Sensitivity** Financial; `account_number_enc` Sensitive-personal and Financial

The bank or wallet account the platform pays the shop's balance to (FR-SHOP-010).

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                           |
| -------------------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                 |
| `shop_id`                  | uuid        | no   | App        |                                                                                                                                                                 |
| `method`                   | text        | no   | App        | `bank_transfer` or `wallet`                                                                                                                                     |
| `account_name`             | text        | no   | App        | Account holder name as the bank or wallet shows it                                                                                                              |
| `bank_name`                | text        | no   | App        | Bank name, or the wallet provider for `wallet`                                                                                                                  |
| `branch_name`              | text        | yes  |            | Bank branch, when the bank needs it for transfers                                                                                                               |
| `account_number_enc`       | text        | yes  | App        | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)); for wallets, the wallet ID. Null only after the retention purge of a replaced or retired account |
| `account_number_last4`     | char(4)     | no   | App        | The only part any response shows                                                                                                                                |
| `created_by`               | uuid        | no   | App        | The owner who entered it                                                                                                                                        |
| `verified_at`              | timestamptz | yes  |            | Set by a `finance_officer`                                                                                                                                      |
| `verified_by`              | uuid        | yes  |            |                                                                                                                                                                 |
| `replaced_at`              | timestamptz | yes  |            | Set when a newer account replaces this one                                                                                                                      |
| `retired_at`               | timestamptz | yes  |            | Set only by the retention command, on the never-replaced account of a closed shop, in the `UPDATE` that nulls `account_number_enc` (Lifecycle and retention)    |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                 |

**Keys and constraints**

- `shop_payout_accounts_pkey PRIMARY KEY (id)`; `shop_payout_accounts_id_shop_id_key UNIQUE (id, shop_id)`, the target of `payouts_account_fkey` (§13.2), so a payout can only go to an account of its own shop ([04 §2.5](04-domain-model-and-data-dictionary.md)); FKs to `shops (id)` and `users (id)` (`created_by`, `verified_by`), `ON DELETE RESTRICT`.
- `shop_payout_accounts_account_number_enc_check`: the ciphertext format CHECK of §5.1 (INV-25), allowing null; `shop_payout_accounts_account_number_check CHECK (account_number_enc IS NOT NULL OR replaced_at IS NOT NULL OR retired_at IS NOT NULL)`: only a replaced or retired account may lose its number.
- `shop_payout_accounts_method_check CHECK (method IN ('bank_transfer','wallet'))`; `shop_payout_accounts_last4_check CHECK (account_number_last4 ~ '^[0-9]{4}$')`; `shop_payout_accounts_account_name_check CHECK (char_length(account_name) BETWEEN 2 AND 100)`.
- `shop_payout_accounts_verification_check CHECK ((verified_at IS NULL) = (verified_by IS NULL) AND (verified_by IS NULL OR verified_by <> created_by))`: the verifier is never the person who entered the account (AC-FR-SHOP-010-3). This check is not relaxed by `single_operator_mode`, because an owner verifying their own bank account defeats the point of verifying.
- `shop_payout_accounts_active_key UNIQUE (shop_id) WHERE replaced_at IS NULL AND retired_at IS NULL` (partial): one active account per shop; a retired row is never active, so it is never payable. `replacePayoutAccount` locks the shop row `FOR UPDATE` first (level 0 of [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)), then sets `replaced_at` on the old row and inserts the new one in the same transaction, so two concurrent replacements queue and the last one wins instead of failing with 23505.
- Application-enforced: only the owner can read or replace the account, and replacing requires re-entering the password [Assumption, AC-FR-SHOP-010-1]. Payouts (R1.1) go only to the active row with `verified_at IS NOT NULL` (§13.2): `createPayout` checks it (422 `VALIDATION_FAILED` otherwise), and `approvePayout` re-checks it after locking the shop and payout rows, refusing with 409 `CONFLICT` (`payout_stale`, proposed) when the payout's account has been replaced since drafting ([07 TM-28](07-security-threat-model-and-permissions.md#tm-28-payout-account-takeover-and-payout-fraud)). `payouts_account_fkey` only keeps the account in the same shop. T-SHOP-105 (proposed) covers both checks, including an account replaced between drafting and approval.

**Indexes.** `shop_payout_accounts_active_key` serves `getPayoutAccount` and the payout eligibility check. `shop_payout_accounts_id_shop_id_key` is a foreign-key target only. The finance verification queue (`WHERE verified_at IS NULL AND replaced_at IS NULL AND retired_at IS NULL`) reads fewer than 50 rows and has no index.

**Lifecycle and retention.** A replaced account is kept, because a past payout must show where the money went. Rows are kept 7 years after `replaced_at` or after the last payout to them, whichever is later; the retention command then nulls `account_number_enc` and keeps the last four digits ([04 §19.3](04-domain-model-and-data-dictionary.md)) [Verify-external VX-08]. Closing a shop does not touch its active account, so a settlement recorded after closure ([05 §6.10](05-order-payment-and-inventory-lifecycles.md)) can still be paid to it. For that last account of a closed shop, never replaced, the clock is the later of `shops.closed_at` and the last payout to it; at the end the retention command sets `retired_at = now()` and nulls `account_number_enc` in one `UPDATE`, which `shop_payout_accounts_account_number_check` allows.

### 6.8 `shop_categories`

**Module** `shops` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Classification of shops (not products) for onboarding and future shop directories ([00 §5.5](00-context-assumptions-and-questions.md), item 7). It never drives product navigation.

| Column                     | Type        | Null | Default | Notes                                                                                                                |
| -------------------------- | ----------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------- |
| `code`                     | text        | no   | App     | Primary key. Keeps today's ids (`mens-fashion`, `footwear`, …) [Verified-repo `shared/constants/shop_categories.ts`] |
| `label`                    | text        | no   | App     | Display name                                                                                                         |
| `description`              | text        | yes  |         |                                                                                                                      |
| `icon`                     | text        | yes  |         | Lucide icon name used by the onboarding UI                                                                           |
| `position`                 | smallint    | no   | `0`     | Display order                                                                                                        |
| `is_active`                | boolean     | no   | `true`  |                                                                                                                      |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                                                      |

**Keys and constraints.** `shop_categories_pkey PRIMARY KEY (code)`; `shop_categories_code_check CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(code) <= 50)`; `shop_categories_label_check CHECK (char_length(label) BETWEEN 2 AND 60)`.

**Indexes.** Primary key only; the list is loaded whole and cached.

**Lifecycle and retention.** Seeded by the production-safe reference seeder (idempotent upsert on `code`). `beauty-and-personal-care` is seeded with `is_active = false` while DripNepal lists fashion only ([04 §21.1](04-domain-model-and-data-dictionary.md)), so onboarding does not offer it. Deactivated, never deleted. Kept indefinitely.

### 6.9 `shop_category_assignments`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration · **Sensitivity** Public

Which shop categories a shop belongs to. Replaces `shop_categories_shop`.

| Column               | Type        | Null | Default | Notes |
| -------------------- | ----------- | ---- | ------- | ----- |
| `shop_id`            | uuid        | no   | App     |       |
| `shop_category_code` | text        | no   | App     |       |
| `created_at`         | timestamptz | no   | `now()` |       |

**Keys and constraints.** `shop_category_assignments_pkey PRIMARY KEY (shop_id, shop_category_code)`; `shop_category_assignments_shop_fkey` to `shops (id)` and `shop_category_assignments_category_fkey` to `shop_categories (code)`, both `ON DELETE RESTRICT`. Application-enforced: 1 to 3 categories per shop [Assumption], all active, checked by every writer below; the forms take the active codes from page props (§6.8 is loaded whole and cached), so no list operation is needed. Written with the query builder (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** The primary key serves "categories of this shop". A reverse index for a shop directory is added with that feature.

**Lifecycle and retention.** Written from `shop_category_codes` (1 to 3 active codes; a proposed input of `applyForShop`, `resubmitShopApplication` and `updateShopProfile`): `applyForShop` inserts the set, and the other two replace it as a set when the input is present (delete and insert in one transaction, audited). Kept while the shop is open and until 7 years after `closed_at` (retention command, [04 §19.3](04-domain-model-and-data-dictionary.md)); the 1-year purge of an application that was never approved deletes them earlier (§6.1).

### 6.10 `slug_redirects`

**Module** `shops` (shop slugs) and `catalog` (category slugs) · **Release** R1 · **Shop scope** none · **Lifecycle** Reference, except that it has no `is_active` and a row is deleted only as stated below · **Sensitivity** Public

Old shop and category slugs, so that old URLs answer 301 ([04 §3.13](04-domain-model-and-data-dictionary.md), FR-SHOP-012, AC-FR-CAT-001-3).

| Column        | Type        | Null | Default | Notes                                                 |
| ------------- | ----------- | ---- | ------- | ----------------------------------------------------- |
| `entity_type` | text        | no   | App     | `shop` or `category`                                  |
| `old_slug`    | citext      | no   | App     | The retired slug                                      |
| `entity_id`   | uuid        | no   | App     | `shops.id` or `categories.id`                         |
| `created_by`  | uuid        | yes  |         | Staff user; null when written by the reference seeder |
| `created_at`  | timestamptz | no   | `now()` |                                                       |

**Keys and constraints**

- `slug_redirects_pkey PRIMARY KEY (entity_type, old_slug)`: an old slug maps to one entity per type. The key is composite, so the table is written only with the query builder, never through a model's `save()` or `delete()` ([04 §2.15](04-domain-model-and-data-dictionary.md)).
- `slug_redirects_entity_type_check CHECK (entity_type IN ('shop','category'))`; `slug_redirects_old_slug_check CHECK (old_slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')`.
- `slug_redirects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT`.
- `entity_id` has no foreign key because it points at two tables. The alternative, a nullable `shop_id` and `category_id` with a CHECK that exactly one is set, was rejected to keep the agreed column set; the tradeoff is that only the action guarantees the target exists. The slug-change actions insert the redirect in the same transaction as the rename, and T-SHOP-104 (proposed) checks that every redirect resolves.
- Application-enforced: a new or changed slug may not equal an `old_slug` of the same entity type that points at a different entity. Renaming an entity back to one of its own old slugs deletes that redirect row in the same transaction (`trx.from('slug_redirects').where({ entity_type, old_slug, entity_id }).delete()`); this is the only way a row is ever deleted (no retention rule deletes one, Lifecycle and retention).

**Indexes.** The primary key serves the fallback lookup when a slug is not found: `WHERE entity_type = 'shop' AND old_slug = ?`, then 301 to the entity's current slug. Every old slug points directly at the entity, so there are no redirect chains.

**Lifecycle and retention.** Inserted on each slug change. Rows are kept as long as their shop or category row, which is never deleted in R1–R3, because links shared years ago should still work. An old slug therefore stays reserved for its entity for good, within its entity type: no other shop can ever take a closed shop's old slugs, so an old link never opens a different shop (§6.1, [04 §3.13](04-domain-model-and-data-dictionary.md)). The rows are Public and hold no personal data, so no retention rule deletes them ([04 §19.3](04-domain-model-and-data-dictionary.md)).

---

## 7. Catalog and media

Owned by the `catalog` module, except `media_assets` and `product_media` (module `media`), per [03 §4.4](03-system-architecture.md). Product status transitions are in [05 §6.10](05-order-payment-and-inventory-lifecycles.md). Reference tables (§7.1–§7.5) are written only by production-safe, idempotent seeders in R1 (`database/seeders/reference/`, RF-05) and by the admin UI from R2 (FR-ADM-006). The proposed seed values are in [04 §21](04-domain-model-and-data-dictionary.md).

### 7.1 `categories`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

The garment-type tree ([04 §3.6](04-domain-model-and-data-dictionary.md)).

| Column                     | Type        | Null | Default    | Notes                                                |
| -------------------------- | ----------- | ---- | ---------- | ---------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                      |
| `parent_id`                | uuid        | yes  |            | Null for top-level categories                        |
| `slug`                     | citext      | no   | App        | Globally unique; `/c/{slug}`                         |
| `name`                     | text        | no   | App        | 2–60 characters; unique among siblings only          |
| `description`              | text        | yes  |            | Category page copy for SEO (FR-SRCH-005)             |
| `path`                     | text        | no   | App        | Materialised slug path, `'/clothing/tops/t-shirts/'` |
| `depth`                    | smallint    | no   | App        | 1 for top level                                      |
| `position`                 | smallint    | no   | `0`        | Order among siblings                                 |
| `is_active`                | boolean     | no   | `true`     |                                                      |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                      |

**Keys and constraints**

- `categories_pkey PRIMARY KEY (id)`; `categories_parent_fkey FOREIGN KEY (parent_id) REFERENCES categories (id) ON DELETE RESTRICT` (fixes F13: today `parent_id` is a string with no key).
- `categories_slug_key UNIQUE (slug)`; `categories_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$')` (3–40 characters, the shop slug rule of [04 §2.8](04-domain-model-and-data-dictionary.md)).
- `categories_parent_name_key UNIQUE NULLS NOT DISTINCT (parent_id, name)`: "T-Shirts" may exist under two parents but not twice under one, and not twice at top level. Without `NULLS NOT DISTINCT`, nulls count as distinct in a unique constraint, so two top-level rows with the same name would pass [Verified-doc <https://www.postgresql.org/docs/18/sql-createtable.html>].
- `categories_path_key UNIQUE (path)`; `categories_path_check CHECK (path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/)+$')`.
- `categories_depth_check CHECK (depth BETWEEN 1 AND 4 AND (parent_id IS NULL) = (depth = 1))`; `categories_not_own_parent_check CHECK (parent_id IS NULL OR parent_id <> id)`.
- Seeder-enforced, because they span rows: `path` = parent's `path` + `slug` + `/`, and `depth` = parent's `depth` + 1, computed top-down, which also makes a cycle impossible; a category that has products cannot receive a child until its products move ([04 §3.6](04-domain-model-and-data-dictionary.md)); a category that has products that are not `archived` cannot be deactivated either, because the product actions accept only an active category ([04 §3.6](04-domain-model-and-data-dictionary.md)) and every edit of such a product would then fail until it is moved (the seeder moves the products first, [04 §21.1](04-domain-model-and-data-dictionary.md)); a slug or parent change rewrites the paths of the whole subtree in one statement (`UPDATE categories SET path = :new || substr(path, length(:old) + 1) WHERE path LIKE :old || '%'`), inserts a `slug_redirects` row and queues `catalog.rebuild_listings`.

**Indexes.** Unique indexes only. The tree has on the order of 100 rows and is loaded whole by `catalog/queries.ts categoryTree()` and cached in each process until the next deploy or seeder run. Subtree and ancestor queries run against that cache, or against `product_listings.category_path` (§7.12).

**Lifecycle and retention.** Reference: never deleted, deactivated with `is_active = false`. Kept indefinitely; order lines keep their own `category_path_snapshot` (§11.3).

### 7.2 `attributes`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Platform-defined properties (`audience`, `material`, `apparel_size`, `shoe_size_eu`, `waist_size_in`, `color`; catalogue in [04 §21.2](04-domain-model-and-data-dictionary.md)).

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                              |
| `code`                     | text        | no   | App        | Immutable: used in option signatures and filter URLs                                                                                                                                                                                                                         |
| `name`                     | text        | no   | App        | Display name                                                                                                                                                                                                                                                                 |
| `scope`                    | text        | no   | App        | `product` (values in `product_attribute_values`) or `variant` (values in `variant_option_values`)                                                                                                                                                                            |
| `input`                    | text        | no   | App        | `single` or `multi`                                                                                                                                                                                                                                                          |
| `is_filterable`            | boolean     | no   | `false`    | Shown as a storefront filter. True only for an attribute whose code the `listProducts` allowlist of [06 §6.3](06-api-design.md#63-filter-and-sort-allowlists) names and whose values `product_listings` (§7.12) carries ([04 §21.2](04-domain-model-and-data-dictionary.md)) |
| `position`                 | smallint    | no   | `0`        | Filter and form order                                                                                                                                                                                                                                                        |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                              |

**Keys and constraints.** `attributes_pkey PRIMARY KEY (id)`; `attributes_code_key UNIQUE (code)`; `attributes_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$')`; `attributes_scope_check CHECK (scope IN ('product','variant'))`; `attributes_input_check CHECK (input IN ('single','multi'))`; `attributes_variant_single_check CHECK (scope <> 'variant' OR input = 'single')`, because a variant has exactly one value per axis.

**Indexes.** `attributes_code_key` maps filter parameters and seeder rows to IDs. The table (about 10 rows) is cached with the category tree.

**Lifecycle and retention.** Reference; never deleted or renamed by code. Kept indefinitely.

### 7.3 `attribute_values`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Allowed values of each attribute, unique per attribute rather than globally (fixes F12: shoe size 40 and waist 40 can coexist).

| Column                     | Type        | Null | Default    | Notes                                                                                                             |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                   |
| `attribute_id`             | uuid        | no   | App        |                                                                                                                   |
| `code`                     | text        | no   | App        | Immutable; `m`, `42`, `42-5`, `black`                                                                             |
| `label`                    | text        | no   | App        | `M`, `42`, `42.5`, `Black`                                                                                        |
| `position`                 | smallint    | no   | `0`        | Picker and filter order (XS before S)                                                                             |
| `swatch_hex`               | text        | yes  |            | `color` only; lower-case `#rrggbb`; null draws a pattern chip ([04 §3.9](04-domain-model-and-data-dictionary.md)) |
| `is_active`                | boolean     | no   | `true`     | Inactive values leave pickers; existing products keep them                                                        |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                   |

**Keys and constraints.** `attribute_values_pkey PRIMARY KEY (id)`; `attribute_values_attribute_fkey FOREIGN KEY (attribute_id) REFERENCES attributes (id) ON DELETE RESTRICT`; `attribute_values_attribute_code_key UNIQUE (attribute_id, code)`; `attribute_values_id_attribute_id_key UNIQUE (id, attribute_id)`, the target of the "value belongs to attribute" composite keys ([04 §2.5](04-domain-model-and-data-dictionary.md)); `attribute_values_code_check CHECK (code ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$' AND char_length(code) <= 40)`; `attribute_values_label_check CHECK (char_length(label) BETWEEN 1 AND 40)`; `attribute_values_swatch_check CHECK (swatch_hex ~ '^#[0-9a-f]{6}$')`, lower case only, so the column holds one form of each colour. That swatches appear only on `color` values is a seeder rule.

**Indexes.** `attribute_values_attribute_code_key` serves filter URLs (`?size=m` → value ID) and seeder upserts. Value lists are cached per attribute.

**Lifecycle and retention.** Reference; deactivated, never deleted (products and order snapshots may name them). Kept indefinitely.

### 7.4 `category_attributes`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Which attributes apply to a category and its descendants, and how ([04 §3.7](04-domain-model-and-data-dictionary.md)).

| Column         | Type     | Null | Default | Notes                                                                                           |
| -------------- | -------- | ---- | ------- | ----------------------------------------------------------------------------------------------- |
| `category_id`  | uuid     | no   | App     |                                                                                                 |
| `attribute_id` | uuid     | no   | App     |                                                                                                 |
| `usage`        | text     | no   | App     | `product` (needs a product-scope attribute) or `variant_axis` (needs a variant-scope attribute) |
| `is_required`  | boolean  | no   | `false` | Required at submit and publish                                                                  |
| `position`     | smallint | no   | `0`     | Form order                                                                                      |

**Keys and constraints.** `category_attributes_pkey PRIMARY KEY (category_id, attribute_id)`; FKs to `categories (id)` and `attributes (id)`, `ON DELETE RESTRICT`; `category_attributes_usage_check CHECK (usage IN ('product','variant_axis'))`. The usage/scope match is a seeder check covered by T-CAT-104 (proposed). Written with the query builder ([04 §2.15](04-domain-model-and-data-dictionary.md)).

Effective rules for a leaf, deepest row winning:

```sql
SELECT DISTINCT ON (ca.attribute_id)
       ca.attribute_id, a.code, a.input, ca.usage, ca.is_required
FROM category_attributes ca
JOIN categories c ON c.id = ca.category_id
JOIN attributes a ON a.id = ca.attribute_id
WHERE :leaf_path LIKE c.path || '%'          -- the leaf and all its ancestors
ORDER BY ca.attribute_id, c.depth DESC;
```

**Indexes.** Primary key only; the table (a few hundred rows at most) is cached with the tree, and the query above runs against the cache in production and against the database in T-CAT-104 (proposed).

**Lifecycle and retention.** Reference; changed by seeders (R1) or the admin UI (R2) with the compliance report of [04 §3.7](04-domain-model-and-data-dictionary.md). Kept indefinitely.

### 7.5 `brands`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Trademarks products are sold under ([04 §3.10](04-domain-model-and-data-dictionary.md)).

| Column                     | Type        | Null | Default    | Notes                                                                                      |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------ |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                            |
| `slug`                     | citext      | no   | App        | For brand filters now and brand pages later                                                |
| `name`                     | text        | no   | App        | Canonical spelling                                                                         |
| `status`                   | text        | no   | `'active'` | `active`, `pending` (requested, not selectable), `rejected`                                |
| `requires_moderation`      | boolean     | no   | `false`    | Watch-listed brand: products always need moderator approval (AC-FR-CAT-008-3) [Open OD-21] |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                            |

**Keys and constraints.** `brands_pkey PRIMARY KEY (id)`; `brands_slug_key UNIQUE (slug)`; `brands_slug_check` with the shop slug pattern (3–40 characters); `brands_name_lower_key UNIQUE (lower(name))` (unique index); `brands_name_check CHECK (char_length(name) BETWEEN 1 AND 80)`; `brands_status_check CHECK (status IN ('active','pending','rejected'))`.

**Indexes.** `brands_slug_key` for filter URLs; `brands_name_lower_key` stops "Nike" and "NIKE" coexisting. The brand picker loads all active brands (hundreds of rows) once and filters on the client.

**Lifecycle and retention.** Reference; never deleted. Kept indefinitely.

### 7.6 `products`

**Module** `catalog` · **Release** R1 · **Shop scope** shop · **Lifecycle** Entity · **Sensitivity** Public once published; Internal while draft, and for `rejection_reason`

The marketing entity: title, description, category, brand and the listing disclosures of E-Commerce Act 2081 s6 [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; VX-02] (FR-CAT-012). Price, SKU, weight and stock are on variants ([04 §3.4](04-domain-model-and-data-dictionary.md)).

| Column                     | Type        | Null | Default    | Notes                                                                                                                        |
| -------------------------- | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` | Internal ID in seller and admin URLs                                                                                         |
| `shop_id`                  | uuid        | no   | App        | From the URL's shop, never from the body (T-SEC-003)                                                                         |
| `public_id`                | char(8)     | no   | App        | Crockford base32, immutable ([04 §2.1](04-domain-model-and-data-dictionary.md))                                              |
| `slug`                     | text        | no   | App        | Cosmetic; `slugify(title)`, or `product` when the title has no Latin letters or digits (for example a Devanagari-only title) |
| `title`                    | text        | no   | App        | 3–120 characters, NFC; not unique (fixes F10)                                                                                |
| `description`              | text        | yes  |            | Up to 5,000 characters [Assumption], never blank; required at submit                                                         |
| `category_id`              | uuid        | no   | App        | A leaf ([04 §3.6](04-domain-model-and-data-dictionary.md))                                                                   |
| `brand_id`                 | uuid        | yes  |            | Null = own label ([04 §3.10](04-domain-model-and-data-dictionary.md))                                                        |
| `manufacturer_name`        | text        | yes  |            | s6 "producer"; up to 200 characters [Assumption], never blank; required at submit                                            |
| `is_imported`              | boolean     | no   | `false`    |                                                                                                                              |
| `country_of_origin`        | char(2)     | yes  |            | ISO 3166-1 alpha-2; required when imported                                                                                   |
| `warranty_text`            | text        | yes  |            | Warranty or guarantee terms, or "No warranty"; up to 1,000 characters [Assumption], never blank; required at submit          |
| `care_and_precautions`     | text        | yes  |            | s6 "usage precautions"; up to 2,000 characters [Assumption], never blank; required at submit                                 |
| `status`                   | text        | no   | `'draft'`  | CHECK below                                                                                                                  |
| `rejection_reason`         | text        | yes  |            | Latest moderator reason, shown to the shop; history in §7.11                                                                 |
| `submitted_at`             | timestamptz | yes  |            | Last submission for review; orders the moderation queue                                                                      |
| `published_at`             | timestamptz | yes  |            | Last time it became `published`                                                                                              |
| `first_published_at`       | timestamptz | yes  |            | Never cleared; "new arrivals" and sitemap                                                                                    |
| `version`                  | int         | no   | `1`        | `If-Match` (FR-CAT-011)                                                                                                      |
| `created_by`               | uuid        | no   | App        | Member who created it                                                                                                        |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                              |

Material, the other s6 "substance" disclosure, is the `material` attribute (§7.7). Weight is `product_variants.weight_grams`. The delivery estimate, payment methods and tax-inclusive price come from shipping rates, platform settings and variant prices, and are shown on the product page (AC-FR-CAT-012-2).

**Keys and constraints**

- `products_pkey PRIMARY KEY (id)`; `products_id_shop_id_key UNIQUE (id, shop_id)` ([04 §2.5](04-domain-model-and-data-dictionary.md)); `products_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT`; `products_category_fkey` to `categories (id)`, `products_brand_fkey` to `brands (id)` and `products_created_by_fkey` to `users (id)`, all `ON DELETE RESTRICT` (fixes the category cascade of F10).
- `products_public_id_key UNIQUE (public_id)`; `products_public_id_check CHECK (public_id ~ '^[0-9A-HJKMNP-TV-Z]{8}$')`.
- `products_slug_check CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`; `products_title_check CHECK (char_length(title) BETWEEN 3 AND 120)`.
- One named text CHECK per disclosure column ([04 §2.8](04-domain-model-and-data-dictionary.md)): `products_description_check CHECK (description IS NULL OR (description ~ '[^[:space:]]' AND char_length(description) <= 5000))`; `products_manufacturer_name_check CHECK (manufacturer_name IS NULL OR (manufacturer_name ~ '[^[:space:]]' AND char_length(manufacturer_name) <= 200))`; `products_warranty_text_check CHECK (warranty_text IS NULL OR (warranty_text ~ '[^[:space:]]' AND char_length(warranty_text) <= 1000))`; `products_care_and_precautions_check CHECK (care_and_precautions IS NULL OR (care_and_precautions ~ '[^[:space:]]' AND char_length(care_and_precautions) <= 2000))`. A disclosure is null or holds at least one character that is not white space, so `''` or `'  '` never counts as given. The maxima are [Assumption] and are mirrored in `PRODUCT_LIMITS` and the validators ([09](09-code-structure-and-engineering-standards.md)), which trim first. A trimmed blank `description` that still reaches the database is answered 422 `VALIDATION_FAILED` on the column, because `constraint_map.ts` allow-lists these four CHECKs ([04 §16.5](04-domain-model-and-data-dictionary.md)). The pattern has no `?` and no backslash, so it passes through Knex raw SQL unchanged.
- `products_status_check CHECK (status IN ('draft','pending_review','published','unpublished','rejected','archived','blocked'))`.
- `products_country_check CHECK (country_of_origin ~ '^[A-Z]{2}$' AND is_imported = (country_of_origin <> 'NP'))`: when a country is given, an imported product names a country other than `NP` and a domestic one names `NP`. A null country passes here and is caught by the disclosure check below.
- `products_disclosures_check CHECK (status NOT IN ('pending_review','published','unpublished') OR (description IS NOT NULL AND manufacturer_name IS NOT NULL AND warranty_text IS NOT NULL AND care_and_precautions IS NOT NULL AND (NOT is_imported OR country_of_origin IS NOT NULL)))`. The action returns a 422 listing every missing field first (AC-FR-CAT-005-2); this CHECK is the backstop that also stops an edit from clearing a disclosure on a live product, and the text CHECKs above stop it from blanking one. T-CAT-105 (proposed).
- `products_published_at_check CHECK (status <> 'published' OR (published_at IS NOT NULL AND first_published_at IS NOT NULL))`; `products_rejection_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`; `products_submitted_check CHECK (status <> 'pending_review' OR submitted_at IS NOT NULL)`.
- Application-enforced, because they need other rows: leaf and active category (T-CAT-101, proposed); the attribute rules of [04 §3.7](04-domain-model-and-data-dictionary.md); the publication gate (active shop with an accepted agreement, at least one `ready` image, at least one active variant and every active variant priced above zero, shipping configured, AC-FR-CAT-005-2); the two variant rules of that gate also hold on every `replaceProductVariants` of a product in `pending_review`, `published` or `unpublished`, which otherwise answers 422 (AC-FR-CAT-004-3, §7.9); brands with `requires_moderation` forcing `pending_review` even in `post` mode; a `blocked` product cannot be edited, unpublished or restored by the shop.

**Indexes**

| Index                                                                                 | Query it serves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `products_public_id_key`                                                              | Product page `/p/{slug}-{publicId}` and `getProduct`: `WHERE public_id = ?`, then visibility check and 301 if the slug differs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `products_seller_list_idx ON (shop_id, status, updated_at DESC, id DESC)`             | Seller product list `listShopProducts`: `WHERE shop_id = ? AND status = ? AND (updated_at, id) < (:k0, :k1) ORDER BY updated_at DESC, id DESC`, the cursor seek of [06 §6.2](06-api-design.md#62-cursors-everything-else). Both keys descend, so the row comparison matches the index order and rows that share `updated_at` (every row changed in one transaction gets the same `now()`) are neither repeated nor skipped. The default list (`status <> 'archived'`) reads one shop's rows through the `shop_id` prefix and sorts them, a few hundred at A-03 scale ([04 §17.3](04-domain-model-and-data-dictionary.md)). Also drives `listInventory` (§8.1) |
| `products_moderation_queue_idx ON (submitted_at, id) WHERE status = 'pending_review'` | `listModerationQueue`, oldest first (AC-FR-CAT-006-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `products_category_idx ON (category_id)`                                              | Seeder guard "does this category have products?" and the admin catalog view                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `products_brand_idx ON (brand_id) WHERE brand_id IS NOT NULL`                         | Listing a brand's live products for moderator review when `requires_moderation` is switched on (they stay live, and the moderator blocks where needed), and brand usage before a brand is rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

Storefront listing and search read `product_listings` (§7.12), not this table.

**Lifecycle and retention.** Created as `draft` with its default variant by `createProduct` (idempotent, AC-FR-CAT-003-3). Status changes are compare-and-set on `status` and `version`. There is no hard delete (AC-FR-CAT-007-3); `archived` hides a product from the default seller list. `archiveProduct` also sets every `active` variant of the product to `archived` in the same transaction (compare-and-set on `status`), which frees their SKUs (§7.9); their `inventory_items` rows keep the stock, and restocks into them still work (§8.1). `restoreProduct` (`archived → draft`) leaves the variants archived, and the vendor re-activates them through `replaceProductVariants` (§7.9). `unblockProduct` always returns the product to `draft` (`blocked → draft`), whatever its status before the block, so it passes the shop's review mode again before it can be live, and `products_disclosures_check` never meets an incomplete draft on unblock. 01 AC-FR-CAT-006-3, [05 §6.10](05-order-payment-and-inventory-lifecycles.md#610-product-and-shop-lifecycles-summary) and 06 `unblockProduct` say the same (product owner decision, 2026-09-29, replacing the earlier `blocked → unpublished`). T-CAT-105 (proposed) also unblocks a blocked incomplete draft and a blocked `pending_review` product and expects `draft`. Order lines keep snapshots, so a product can change or be archived without altering history ([04 §2.13](04-domain-model-and-data-dictionary.md)). Kept as long as any order line or ledger entry references it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 7.7 `product_attribute_values`

**Module** `catalog` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration · **Sensitivity** Public

Product-scope attribute values, including multi-valued `audience` and `material`.

| Column               | Type        | Null | Default | Notes                       |
| -------------------- | ----------- | ---- | ------- | --------------------------- |
| `product_id`         | uuid        | no   | App     |                             |
| `shop_id`            | uuid        | no   | App     | Copied from the product row |
| `attribute_id`       | uuid        | no   | App     |                             |
| `attribute_value_id` | uuid        | no   | App     |                             |
| `created_at`         | timestamptz | no   | `now()` |                             |

**Keys and constraints.** `product_attribute_values_pkey PRIMARY KEY (product_id, attribute_value_id)`; `product_attribute_values_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE RESTRICT`; `product_attribute_values_value_fkey FOREIGN KEY (attribute_value_id, attribute_id) REFERENCES attribute_values (id, attribute_id) ON DELETE RESTRICT`. Application-enforced ([04 §3.7](04-domain-model-and-data-dictionary.md)): the attribute is an effective `product` rule of the category, and a `single` attribute has at most one row per product. A composite key to `attributes (id, scope, input)` could enforce both, at the cost of two constant columns on every row; it was rejected as more machinery than the risk warrants, since one validated action writes these rows.

**Indexes.** The primary key serves "attributes of this product" for the product page, editor and listing refresh (`WHERE product_id = ?`). `product_attribute_values_value_idx ON (attribute_value_id)` serves listing refresh after a value is relabelled or deactivated (`WHERE attribute_value_id = ?`).

**Lifecycle and retention.** Replaced as a set by `updateProduct` (delete and multi-insert in the product's transaction, [04 §2.15](04-domain-model-and-data-dictionary.md)). Kept while the product exists.

### 7.8 `product_option_axes`

**Module** `catalog` · **Release** R1 · **Shop scope** shop (through the product) · **Lifecycle** Configuration · **Sensitivity** Public

The variant attributes a product varies by: none, one or two in R1 (AC-FR-CAT-004-1).

| Column         | Type        | Null | Default | Notes                                                              |
| -------------- | ----------- | ---- | ------- | ------------------------------------------------------------------ |
| `product_id`   | uuid        | no   | App     |                                                                    |
| `attribute_id` | uuid        | no   | App     | A variant-scope attribute that is an effective `variant_axis` rule |
| `position`     | smallint    | no   | App     | 1 or 2: picker order on the product page                           |
| `created_at`   | timestamptz | no   | `now()` |                                                                    |

**Keys and constraints.** `product_option_axes_pkey PRIMARY KEY (product_id, attribute_id)`, the target of `variant_option_values_axis_fkey`; `product_option_axes_position_key UNIQUE (product_id, position) DEFERRABLE INITIALLY IMMEDIATE`; `product_option_axes_position_check CHECK (position BETWEEN 1 AND 2)`; FKs to `products (id)` and `attributes (id)`, `ON DELETE RESTRICT`. A unique constraint that is not deferrable is checked row by row, so an `UPDATE` that swaps positions 1 and 2 would fail with 23505, and the CHECK leaves no free position to swap through; declared `DEFERRABLE INITIALLY IMMEDIATE`, it is checked at the end of the statement [Verified-doc <https://www.postgresql.org/docs/18/sql-createtable.html>, "Non-Deferred Uniqueness Constraints"]. That is allowed here because the constraint is neither a foreign-key target nor an `ON CONFLICT` arbiter.

**Axes freeze.** Once any variant of the product has an inventory movement or an order line, its axis set is fixed. Such variants can only be archived or re-activated (§7.9), and their option values still reference the axes, so `RESTRICT` blocks removing an axis anyway. `replaceProductVariants` answers 409 `CONFLICT` (axis set frozen) with an explanation instead of letting the 23001 (`restrict_violation`) surface. Adding values on an existing axis (a new colour) is always allowed, and so is reordering the axes (the same set in the other order): `replaceProductVariants` updates `position` in one statement, `UPDATE product_option_axes SET position = CASE attribute_id WHEN :a THEN 1 WHEN :b THEN 2 END WHERE product_id = :p`, and never deletes axis rows to reorder them. Option signatures do not change, because they are sorted by attribute code ([04 §3.5](04-domain-model-and-data-dictionary.md)). T-CAT-106 (proposed) swaps the two axes of a stocked product. To change axes later, the vendor archives the product (which archives its variants and frees their SKUs, §7.6) and creates a new one.

**Indexes.** Primary key only (`WHERE product_id = ?`).

**Lifecycle and retention.** Replaced with the variant set by `replaceProductVariants` while the axes are not frozen; reordered in place at any time (above). Kept while the product exists.

### 7.9 `product_variants`

**Module** `catalog` · **Release** R1 · **Shop scope** shop · **Lifecycle** Entity (`active` or `archived`) · **Sensitivity** Public

The purchasable unit: SKU, price, weight, options. Stock is in `inventory_items` (§8.1).

| Column                     | Type        | Null | Default    | Notes                                                                                                   |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                         |
| `shop_id`                  | uuid        | no   | App        | Copied from the product                                                                                 |
| `product_id`               | uuid        | no   | App        |                                                                                                         |
| `sku`                      | text        | no   | App        | 1–64 characters; unique per shop among active variants (fixes F11's global SKU)                         |
| `price_minor`              | bigint      | no   | App        | Paisa, tax-inclusive final price ([04 §18](04-domain-model-and-data-dictionary.md))                     |
| `compare_at_price_minor`   | bigint      | yes  |            | Earlier genuine price, shown struck through (FR-PROMO-001)                                              |
| `currency`                 | char(3)     | no   | `'NPR'`    |                                                                                                         |
| `weight_grams`             | int         | yes  |            | Optional disclosure; `material` already satisfies s6 "weight or substance" [Verify-external VX-02]      |
| `is_default`               | boolean     | no   | `false`    | True exactly for the option-less default variant ([04 §3.4](04-domain-model-and-data-dictionary.md))    |
| `option_signature`         | text        | no   | App        | Canonical combination ([04 §3.5](04-domain-model-and-data-dictionary.md)); `''` for the default variant |
| `status`                   | text        | no   | `'active'` | `active` or `archived`                                                                                  |
| `version`                  | int         | no   | `1`        |                                                                                                         |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                         |

**Keys and constraints**

- `product_variants_pkey PRIMARY KEY (id)`; `product_variants_id_shop_id_key UNIQUE (id, shop_id)` and `product_variants_id_product_id_key UNIQUE (id, product_id)` (targets for inventory, cart, order-line and option-value keys, [04 §2.5](04-domain-model-and-data-dictionary.md)); `product_variants_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE RESTRICT`.
- `product_variants_currency_check CHECK (currency = 'NPR')`.
- `product_variants_price_check CHECK (price_minor BETWEEN 0 AND 100000000)`: at most Rs 10,00,000 [Assumption, AC-FR-CAT-004-3]. The upper bound catches unit mistakes, such as rupees multiplied by 100 twice, before they reach a cart. Zero is allowed only because a draft may not have a price yet; submit, publish and every `replaceProductVariants` of a product in `pending_review`, `published` or `unpublished` require `price_minor > 0` on every active variant (below).
- `product_variants_compare_at_check CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor > price_minor)`.
- `product_variants_weight_check CHECK (weight_grams IS NULL OR weight_grams BETWEEN 1 AND 50000)`.
- `product_variants_sku_check CHECK (char_length(sku) BETWEEN 1 AND 64 AND sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$')`.
- `product_variants_status_check CHECK (status IN ('active','archived'))`.
- `product_variants_default_signature_check CHECK (is_default = (option_signature = ''))`.
- `product_variants_signature_check CHECK (option_signature ~ '^([a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*(\|[a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*)*)?$')`.
- `product_variants_shop_sku_key UNIQUE (shop_id, sku) WHERE status = 'active'` (partial): two shops may use the same SKU (AC-FR-CAT-004-2), and an archived SKU can be reused.
- `product_variants_product_signature_key UNIQUE (product_id, option_signature) WHERE status = 'active'` (partial; [04 §3.5](04-domain-model-and-data-dictionary.md)).
- `product_variants_default_key UNIQUE (product_id) WHERE is_default AND status = 'active'` (partial).
- Application-enforced: every active variant of a product carries exactly the product's current axes (an active default next to axis variants is refused); at most 100 variants per product [Assumption, AC-FR-CAT-004-4]; a product in `pending_review`, `published` or `unpublished` keeps at least one active variant, and every active variant priced above zero, through every `replaceProductVariants` (AC-FR-CAT-004-3; 422 otherwise). A `variants[]` entry whose `id` names an archived variant of this product sets it back to `active`: it must carry the product's current axes, and its SKU and signature must still be free among the active variants (otherwise 422 `VALIDATION_FAILED` on that entry). A restored product (§7.6) has no active variant until the vendor re-activates or adds one, so it cannot be submitted or published before that. T-CAT-106 (proposed), which also covers a zero price and an empty active set on a published product, the re-activation and its SKU conflict.

**Indexes**

| Index                                                  | Query it serves                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `product_variants_product_idx ON (product_id, status)` | Variants of a product for the product page, the seller editor and listing refresh: `WHERE product_id = ? [AND status = 'active']` |
| `product_variants_shop_sku_key`                        | Seller inventory search by exact SKU: `WHERE shop_id = ? AND sku = ? AND status = 'active'`                                       |
| `product_variants_product_signature_key`               | The duplicate-combination guard itself                                                                                            |

**Lifecycle and retention.** Written by `replaceProductVariants` with `If-Match` on the product. A variant that was never stocked or ordered (no inventory movement, no order line), of a product in any status, is hard-deleted together with its zero `inventory_items` row, and its option values cascade ([04 §2.6](04-domain-model-and-data-dictionary.md)). `replaceProductVariants` first locks that `inventory_items` row `FOR UPDATE`, then checks for movements and order lines (`inventory_movements_variant_history_idx`, §8.3; `order_items_variant_idx`, §11.3): a concurrent stock adjustment either commits first, and the variant is archived instead, or waits for the delete. Such a variant cannot be in a cart, because `addCartItem` refuses a variant with no available stock ([02 AC-J02-05](02-user-journeys-and-acceptance-criteria.md#j-02-product-detail--variant-selection)), so `cart_items_variant_fkey` (RESTRICT, §10.2) is only a backstop. A RESTRICT violation (SQLSTATE 23001, `restrict_violation`) that still fires aborts the whole transaction, so nothing can archive the variant after it in the same transaction; the request answers 500 `INTERNAL` ([04 §16.5](04-domain-model-and-data-dictionary.md)). Any other variant is archived, which removes it from carts at the next revalidation; open orders keep their snapshots. `archiveProduct` archives every active variant of the product (§7.6), and an archived variant returns to `active` only through a `variants[]` entry that names its `id` (above). Kept as long as order lines reference it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 7.10 `variant_option_values`

**Module** `catalog` · **Release** R1 · **Shop scope** shop (through the variant) · **Lifecycle** Configuration · **Sensitivity** Public

The value a variant has on each axis. Replaces `product_variant_attribute_values`, which had no `attribute_id` and so could not stop a variant being both Black and White (F11).

| Column               | Type        | Null | Default | Notes                                         |
| -------------------- | ----------- | ---- | ------- | --------------------------------------------- |
| `variant_id`         | uuid        | no   | App     |                                               |
| `product_id`         | uuid        | no   | App     | Carried so the axis key below can be enforced |
| `attribute_id`       | uuid        | no   | App     |                                               |
| `attribute_value_id` | uuid        | no   | App     |                                               |
| `created_at`         | timestamptz | no   | `now()` |                                               |

**Keys and constraints**

- `variant_option_values_pkey PRIMARY KEY (variant_id, attribute_id)`: one value per axis.
- `variant_option_values_variant_fkey FOREIGN KEY (variant_id, product_id) REFERENCES product_variants (id, product_id) ON DELETE CASCADE`: one of the cascades of [04 §2.6](04-domain-model-and-data-dictionary.md), with `product_listings_product_fkey` (§7.12) the other one in the catalog.
- `variant_option_values_axis_fkey FOREIGN KEY (product_id, attribute_id) REFERENCES product_option_axes (product_id, attribute_id) ON DELETE RESTRICT`: the attribute is one of this product's axes.
- `variant_option_values_value_fkey FOREIGN KEY (attribute_value_id, attribute_id) REFERENCES attribute_values (id, attribute_id) ON DELETE RESTRICT`: the value belongs to that attribute. T-CAT-103 (proposed).

What the database refuses, with the constraint that fires:

```sql
-- Product P varies by apparel_size only. Variant V1 is Black / M through a bug.
INSERT INTO variant_option_values (variant_id, product_id, attribute_id, attribute_value_id)
VALUES (:v1, :p, :color_attr, :black);
-- ERROR: … violates foreign key constraint "variant_option_values_axis_fkey"
-- Key (product_id, attribute_id)=(<p>, <color_attr>) is not present in table "product_option_axes".

-- A second active variant with apparel_size:m on product P:
-- ERROR: duplicate key value violates unique constraint "product_variants_product_signature_key"
```

**Indexes.** The primary key serves "options of these variants" (`WHERE variant_id = ANY(:ids)`) for cart and order snapshots. `variant_option_values_product_idx ON (product_id, attribute_id, attribute_value_id)` serves the product page availability matrix and listing refresh (`WHERE product_id = ?`), and the `RESTRICT` check when an axis row is deleted.

**Lifecycle and retention.** Written with the variant in `replaceProductVariants`; removed only by the cascade from a hard-deleted never-stocked variant (§7.9). Kept while the variant exists.

### 7.11 `product_review_decisions`

**Module** `catalog` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (reason and note are shown to the shop)

Moderation decisions (FR-CAT-006, AC-FR-CAT-006-5).

| Column        | Type        | Null | Default    | Notes                                                                                 |
| ------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------- |
| `id`          | uuid        | no   | `uuidv7()` |                                                                                       |
| `product_id`  | uuid        | no   | App        |                                                                                       |
| `shop_id`     | uuid        | no   | App        |                                                                                       |
| `decision`    | text        | no   | App        | `approved`, `rejected`, `blocked`, `unblocked` (the product returns to `draft`, §7.6) |
| `reason_code` | text        | yes  |            | Required for `rejected` and `blocked`                                                 |
| `note`        | text        | yes  |            | Moderator's explanation to the shop                                                   |
| `decided_by`  | uuid        | no   | App        | Staff user with `platform.products.moderate`                                          |
| `created_at`  | timestamptz | no   | `now()`    |                                                                                       |

**Keys and constraints.** `product_review_decisions_pkey PRIMARY KEY (id)`; `product_review_decisions_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE RESTRICT`; `product_review_decisions_decided_by_fkey` to `users (id) ON DELETE RESTRICT`; `product_review_decisions_decision_check CHECK (decision IN ('approved','rejected','blocked','unblocked'))`; `product_review_decisions_reason_code_check CHECK (reason_code IN ('counterfeit_suspected','misleading_claim','prohibited_item','missing_disclosure','poor_images','other'))`; `product_review_decisions_reason_required_check CHECK (decision NOT IN ('rejected','blocked') OR (reason_code IS NOT NULL AND note IS NOT NULL AND char_length(note) BETWEEN 10 AND 2000))`. Append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)).

**Indexes.** `product_review_decisions_product_idx ON (product_id, created_at DESC)`: moderation history in the seller product view and the moderation screen.

**Lifecycle and retention.** Inserted in the same transaction as the `products.status` change. Kept at least as long as the product row ([04 §19.3](04-domain-model-and-data-dictionary.md)), as evidence for complaints about counterfeit or misleading listings.

### 7.12 `product_listings` (read model)

**Module** `catalog` · **Release** R1 · **Shop scope** shop (denormalised) · **Lifecycle** Derived · **Sensitivity** Public

One row per product that is visible on the storefront: product `published`, shop `active`, at least one `ready` image and at least one active variant. A product that stops being visible loses its row. Storefront listings, filters and search read only this table (ADR-0014), one query per page, with no joins. Staleness of a few seconds is accepted; checkout re-reads the source tables (AC-FR-CAT-005-3).

| Column                               | Type                | Null | Default   | Notes                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------- | ---- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `product_id`                         | uuid                | no   | App       | Primary key                                                                                                                                                                                                                         |
| `shop_id`, `shop_slug`, `shop_name`  | uuid, citext, text  | no   | App       | "Sold by" on cards; shop page filter                                                                                                                                                                                                |
| `public_id`, `slug`, `title`         | char(8), text, text | no   | App       | Card link and title                                                                                                                                                                                                                 |
| `category_id`, `category_path`       | uuid, text          | no   | App       | Subtree filter by path prefix                                                                                                                                                                                                       |
| `category_names`                     | text                | no   | App       | Names along the path, for search                                                                                                                                                                                                    |
| `brand_id`, `brand_name`             | uuid, text          | yes  |           | Brand filter and search                                                                                                                                                                                                             |
| `audience_value_ids`                 | uuid[]              | no   | `'{}'`    |                                                                                                                                                                                                                                     |
| `size_value_ids`                     | uuid[]              | no   | `'{}'`    | Values of every size system, from active variants with available stock only, so "size M" matches only products with M in stock                                                                                                      |
| `color_value_ids`                    | uuid[]              | no   | `'{}'`    | Same rule                                                                                                                                                                                                                           |
| `min_price_minor`, `max_price_minor` | bigint              | no   | App       | Over active variants                                                                                                                                                                                                                |
| `compare_at_price_minor`             | bigint              | yes  |           | Compare-at price of the cheapest variant, for the card                                                                                                                                                                              |
| `currency`                           | char(3)             | no   | `'NPR'`   |                                                                                                                                                                                                                                     |
| `in_stock`                           | boolean             | no   | App       | Any active variant with `on_hand − reserved > 0`                                                                                                                                                                                    |
| `primary_image_keys`                 | jsonb               | no   | App       | Derived image keys of position 1 ([04 §2.11](04-domain-model-and-data-dictionary.md))                                                                                                                                               |
| `published_at`                       | timestamptz         | no   | App       | "Newest" sort                                                                                                                                                                                                                       |
| `search_tsv`                         | tsvector            | no   | generated | `GENERATED ALWAYS AS (setweight(to_tsvector('simple', title), 'A') \|\| setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') \|\| setweight(to_tsvector('simple', category_names \|\| ' ' \|\| shop_name), 'C')) STORED` |
| `refreshed_at`                       | timestamptz         | no   | `now()`   |                                                                                                                                                                                                                                     |

The two-argument `to_tsvector` is required: only text search functions that name a configuration can be used in indexes and generated columns [Verified-doc <https://www.postgresql.org/docs/18/textsearch-tables.html>]. `simple` avoids English stemming of Nepali and romanised Nepali words (ADR-0014).

**Keys and constraints.** `product_listings_pkey PRIMARY KEY (product_id)`; `product_listings_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE CASCADE` (derived, [04 §2.6](04-domain-model-and-data-dictionary.md)); `product_listings_price_range_check CHECK (min_price_minor > 0 AND min_price_minor <= max_price_minor)`; `product_listings_currency_check CHECK (currency = 'NPR')`; `product_listings_image_check CHECK (jsonb_typeof(primary_image_keys) = 'object')`.

**Indexes**

| Index                                                                                              | Query it serves                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Primary key                                                                                        | Refresh upsert `INSERT … ON CONFLICT (product_id) DO UPDATE`, and delete when a product stops being visible                                                                                                                                                                                                                                                                                                        |
| `product_listings_category_idx ON (category_path text_pattern_ops, published_at DESC, product_id)` | Category page, newest first: `WHERE category_path LIKE '/clothing/tops/%' ORDER BY published_at DESC, product_id LIMIT 24 OFFSET :o`. `text_pattern_ops` is needed for `LIKE` prefix matching in a non-C locale [Verified-doc <https://www.postgresql.org/docs/18/indexes-opclass.html>]. For a leaf the scan is already in order; for a parent the matching rows are sorted, at most a few thousand at A-03 scale |
| `product_listings_shop_idx ON (shop_id, published_at DESC, product_id)`                            | Shop page `/shops/{slug}`                                                                                                                                                                                                                                                                                                                                                                                          |
| `product_listings_search_idx USING GIN (search_tsv)`                                               | Keyword search: `WHERE search_tsv @@ websearch_to_tsquery('simple', :q)`, ranked with `ts_rank`                                                                                                                                                                                                                                                                                                                    |
| `product_listings_title_trgm_idx USING GIN (title gin_trgm_ops)`                                   | Typo-tolerant fallback when full-text search finds nothing: `WHERE title % :q ORDER BY similarity(title, :q) DESC` (pg_trgm, [04 §2.8](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                    |

Audience, size, colour, brand and price filters are applied to the rows selected by the category or shop index. At the launch catalog size (at most 5,000 products, A-03) that costs a few milliseconds. GIN indexes on the arrays are added only if T-PERF-001 shows listing p95 above 300 ms, which is also a trigger to revisit ADR-0014.

**Lifecycle and retention.** Recomputed from source tables by `catalog.refresh_listing` (one job per affected product, on a `standard` queue with no `singletonKey`, because business transactions send it and a keyed send would add a lock to them, [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering) and [§4.7](05-order-payment-and-inventory-lifecycles.md#47-what-runs-after-commit)) after product, variant, inventory-availability, media and shop-status events, and fully by `catalog.rebuild_listings` nightly ([03 §9](03-system-architecture.md)). Replays are harmless because each run rewrites the whole row. Nothing is retained beyond visibility. T-CAT-108 (proposed): a row exists if and only if the product is visible, and two refreshes give the same row.

### 7.13 `media_assets`

**Module** `media` · **Release** R1 · **Shop scope** shop · **Lifecycle** Entity · **Sensitivity** Public (derived product, logo and banner images); Sensitive-personal (`kyc_document` originals)

Every uploaded file: product images, shop logos and banners, and KYC documents. The upload pipeline is in [03 §7.5](03-system-architecture.md) and ADR-0013. Only object keys are stored, never URLs (fixes F15's 255-character URLs and missing storage key).

| Column                     | Type        | Null | Default            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------------- | ----------- | ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()`         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shop_id`                  | uuid        | no   | App                | Uploads are always on behalf of a shop, including an applicant shop in `pending_review`                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `kind`                     | text        | no   | App                | `product_image`, `shop_logo`, `shop_banner`, `kyc_document`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `document_type`            | text        | yes  |                    | KYC only: `business_registration_certificate`, `pan_vat_certificate`, `owner_identity_document`, `other` [Open OD-16]                                                                                                                                                                                                                                                                                                                                                                                                             |
| `status`                   | text        | no   | `'pending_upload'` | `pending_upload`, `processing`, `ready`, `rejected`, `deleted`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `original_key`             | text        | no   | App                | The upload key `originals/<shop_id>/<id>` in the private bucket ([03 §3.5](03-system-architecture.md)) until validation. The worker then writes the bytes it validated to a final key that no presigned URL targets (for example `originals/<shop_id>/<id>/v1`), sets this column to it in the transaction that sets `ready`, and deletes the upload key ([07 TM-15](07-security-threat-model-and-permissions.md#tm-15-unsafe-uploads-and-image-processing)). Every later read, including the KYC presigned GET, uses this column |
| `derived_keys`             | jsonb       | yes  |                    | Width → public WebP key, for example `{"320": "p/<id>/<sha-prefix>-320.webp", …}`. Never set for KYC                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `mime`                     | text        | no   | App                | Declared at creation; the worker rejects the file if its magic bytes disagree                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `bytes`                    | int         | no   | App                | Declared at creation by `createMediaUpload`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `upload_etag`              | text        | yes  |                    | ETag of the uploaded object, stored by `completeMediaUpload` from its `HEAD`; `media.process_upload` reads with `If-Match` on it, so the object checked is the object read ([07 TM-15](07-security-threat-model-and-permissions.md#tm-15-unsafe-uploads-and-image-processing))                                                                                                                                                                                                                                                    |
| `upload_bytes`             | int         | yes  |                    | Object size from the same `HEAD`, kept apart from the declared `bytes` because the presigned URL does not bind the size; an object above 10 MB is `rejected` instead                                                                                                                                                                                                                                                                                                                                                              |
| `width`, `height`          | int         | yes  |                    | Set by the worker for images                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sha256`                   | bytea       | yes  |                    | Of the original; set by the worker                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `rejection_reason`         | text        | yes  |                    | Shown to the uploader                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `uploaded_by`              | uuid        | no   | App                |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `processed_at`             | timestamptz | yes  |                    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `created_at`, `updated_at` | timestamptz | no   | `now()`            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Keys and constraints**

- `media_assets_pkey PRIMARY KEY (id)`; `media_assets_id_shop_id_key UNIQUE (id, shop_id)` (targets for `shops.logo_media_id` and `banner_media_id`); `media_assets_id_shop_id_kind_key UNIQUE (id, shop_id, kind)` (target for `product_media`, §7.14); `media_assets_shop_fkey` to `shops (id)` and `media_assets_uploaded_by_fkey` to `users (id)`, `ON DELETE RESTRICT`.
- `media_assets_kind_check CHECK (kind IN ('product_image','shop_logo','shop_banner','kyc_document'))`; `media_assets_status_check CHECK (status IN ('pending_upload','processing','ready','rejected','deleted'))`.
- `media_assets_mime_check CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf') AND (mime <> 'application/pdf' OR kind = 'kyc_document'))` (A-31; PDF for KYC only [Assumption, AC-FR-SHOP-014-3]).
- `media_assets_bytes_check CHECK (bytes BETWEEN 1 AND 10485760)` (10 MB); `media_assets_upload_bytes_check CHECK (upload_bytes IS NULL OR upload_bytes BETWEEN 1 AND 10485760)`; `media_assets_upload_etag_check CHECK (upload_etag IS NULL OR char_length(upload_etag) BETWEEN 1 AND 128)`; `media_assets_upload_check CHECK (status NOT IN ('processing','ready') OR (upload_etag IS NOT NULL AND upload_bytes IS NOT NULL))`: the worker never processes an object whose `HEAD` was not recorded.
- `media_assets_document_type_check CHECK ((kind = 'kyc_document') = (document_type IS NOT NULL) AND (document_type IS NULL OR document_type IN ('business_registration_certificate','pan_vat_certificate','owner_identity_document','other')))`.
- `media_assets_kyc_private_check CHECK (kind <> 'kyc_document' OR derived_keys IS NULL)`: a KYC document never gets a public derivative.
- `media_assets_ready_check CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND processed_at IS NOT NULL AND (kind = 'kyc_document' OR (derived_keys IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL))))`.
- `media_assets_rejected_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`; `media_assets_sha256_check CHECK (sha256 IS NULL OR octet_length(sha256) = 32)`; `media_assets_derived_keys_check CHECK (derived_keys IS NULL OR jsonb_typeof(derived_keys) = 'object')`.
- Application-enforced: at most 5 KYC documents per shop (AC-FR-SHOP-014-3); upload creation limited to 120 per hour per shop (rate limiter, §15.4).

**Indexes**

| Index                                                                                    | Query it serves                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `media_assets_shop_kind_idx ON (shop_id, kind, created_at DESC)`                         | Seller media picker (`kind = 'product_image'`) and the KYC document list for the owner and reviewers |
| `media_assets_cleanup_idx ON (created_at) WHERE status IN ('pending_upload','rejected')` | `media.cleanup_abandoned`: uploads never completed within 24 h, and originals of rejected files      |

**Lifecycle and retention.** `pending_upload` → `processing` → `ready` or `rejected`, each step a compare-and-set by the web process or the worker. `completeMediaUpload` records `upload_etag` and `upload_bytes` in the step to `processing`; by `ready`, `original_key` names the final key and the upload key is deleted (above). `deleted` means the stored objects were removed and the row is kept as a tombstone. Derived public images are content-addressed and never overwritten; in R1 they are not deleted either, because order snapshots may point at them (§11.3). Originals of rejected or abandoned uploads are deleted after 24 hours by the daily `media.cleanup_abandoned` job ([03 §9](03-system-architecture.md)). KYC originals of an approved shop are kept until 7 years after the shop is closed ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]); for an application that is rejected and not resubmitted, they are deleted one year after the last rejection [Assumption; OD-16, VX-03] by the daily `platform.retention_purge` job (proposed, [03 §9](03-system-architecture.md)), built in R1 together with the purge of the application's other data (§6.1): `media_assets` is not append-only, so `dripnepal_app` deletes the objects and sets `status = 'deleted'`. Every staff view of a KYC document is audited (AC-FR-SHOP-014-2). T-MED-001 (proposed) covers file validation; T-MED-103 (proposed) checks that no code path produces a public key for a `kyc_document`.

### 7.14 `product_media`

**Module** `media` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration · **Sensitivity** Public

Ordered product gallery, with optional colour links ([04 §3.9](04-domain-model-and-data-dictionary.md)).

| Column           | Type        | Null | Default           | Notes                                                                     |
| ---------------- | ----------- | ---- | ----------------- | ------------------------------------------------------------------------- |
| `product_id`     | uuid        | no   | App               |                                                                           |
| `shop_id`        | uuid        | no   | App               |                                                                           |
| `media_asset_id` | uuid        | no   | App               |                                                                           |
| `media_kind`     | text        | no   | `'product_image'` | Constant, carried only so the key below can check the asset's kind        |
| `color_value_id` | uuid        | yes  |                   | A `color` value used by the product's variants                            |
| `position`       | smallint    | no   | App               | 1 = primary image (fixes F15's text sort order)                           |
| `alt_text`       | text        | yes  |                   | Up to 150 characters; empty means the storefront uses "{title}, {colour}" |
| `created_at`     | timestamptz | no   | `now()`           |                                                                           |

**Keys and constraints**

- `product_media_pkey PRIMARY KEY (product_id, media_asset_id)`; `product_media_position_key UNIQUE (product_id, position)`.
- `product_media_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE RESTRICT`.
- `product_media_asset_fkey FOREIGN KEY (media_asset_id, shop_id, media_kind) REFERENCES media_assets (id, shop_id, kind) ON DELETE RESTRICT`: the image belongs to the same shop (A1-02) **and** is a product image. A KYC document, which may be a citizenship card, can never be placed in a public gallery, even by a bug in a new endpoint. The cost is one constant column and one extra unique index on `media_assets`. T-MED-101 and T-MED-102 (proposed) insert a cross-shop asset and a `kyc_document` directly and expect 23503.
- `product_media_media_kind_check CHECK (media_kind = 'product_image')`; `product_media_position_check CHECK (position BETWEEN 1 AND 12)` [Assumption, AC-FR-MED-002-1]; `product_media_alt_text_check CHECK (alt_text IS NULL OR char_length(alt_text) <= 150)`.
- `product_media_color_fkey FOREIGN KEY (color_value_id) REFERENCES attribute_values (id) ON DELETE RESTRICT`. That it is a colour value used by the product is checked by `replaceProductMedia`; that the asset is `ready` is checked there too and again by the listing rule (§7.12).

**Indexes.** `product_media_position_key` serves the gallery, `WHERE product_id = ? ORDER BY position`. The primary key serves duplicate prevention.

**Lifecycle and retention.** `replaceProductMedia` (with `If-Match` on the product) deletes and re-inserts the whole set in one transaction. Reordering therefore never has to swap two positions under the unique index, which would otherwise need a deferrable constraint. Rows live as long as the product; the assets they point at follow §7.13.

### 7.15 `collections` and `collection_products` (R2)

**Module** `catalog` · **Release** R2 (created in M9, not in the R0 baseline, [04 §3.11](04-domain-model-and-data-dictionary.md)) · **Shop scope** none (platform-curated, spans shops) · **Lifecycle** Entity / Configuration · **Sensitivity** Public

Brief definition, to be completed in M9:

- `collections`: `id uuid PK DEFAULT uuidv7()`, `slug citext UNIQUE` (shop slug pattern, 3–40 characters), `title text` (3–80), `description text NULL`, `status text` with `CHECK (status IN ('draft','published','archived'))`, `starts_at` and `ends_at timestamptz NULL` with `CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)`, `created_by uuid REFERENCES users ON DELETE RESTRICT`, `created_at`, `updated_at`.
- `collection_products`: `collection_id` and `product_id`, `PRIMARY KEY (collection_id, product_id)`, `position smallint NOT NULL`, `UNIQUE (collection_id, position)`, both FKs `ON DELETE RESTRICT`. Only products with a `product_listings` row are shown, so an archived product silently drops out without a delete.
- Index: `collection_products_product_idx ON (product_id)` for "collections this product is in" on the product page. Collection pages get a `collection_ids uuid[]` column on `product_listings` at the same time, so they stay single-table queries. `collections_slug_key` serves the collection page `WHERE slug = ?`; `UNIQUE (collection_id, position)` serves the collection's product list `WHERE collection_id = ? ORDER BY position`.
- Lifecycle and retention: a collection moves `draft → published → archived` and is never deleted, so old campaign links still resolve to an "ended" page; kept indefinitely. `collection_products` rows are Configuration: replaced as a set by the curator, hard-deleted on removal (to be added to the [04 §2.6](04-domain-model-and-data-dictionary.md) hard-delete list in M9), audited.

---

## 8. Inventory

The `inventory` module is the only writer of the three tables in this section ([03 §4.4](03-system-architecture.md#44-module-responsibilities), ADR-0008). Other modules call its actions (`reserveForOrder`, `commitHeld`, `releaseForOrderItems`, `consumeForShipment`, `restock`, `adjust`, `stocktake`, `correct`) inside their own transaction. How the rows move is specified in [05 §5](05-order-payment-and-inventory-lifecycles.md#5-inventory-reservations-and-movements) and the reservation state machine in [05 §6.9](05-order-payment-and-inventory-lifecycles.md#69-inventory-reservation). This section fixes the rows themselves.

`inventory_items` is the projection that checkout locks. `inventory_reservations` records who holds which units. `inventory_movements` is the append-only journal that explains every number. The invariants that tie them together (`on_hand = Σ on_hand_delta`, `reserved = Σ open reservations`) span rows, so no CHECK can express them. They are kept by writing the projection and its movement in one transaction and checked daily by the drift job ([05 §5.10](05-order-payment-and-inventory-lifecycles.md#510-drift-detection-and-repair)). The single-row invariants below are CHECK constraints.

**How to read the index tables in §8–§15.** Only the listed indexes are created. A foreign-key column gets its own index only when a named query needs it or when its parent rows can be deleted: PostgreSQL runs the RESTRICT check, a lookup of the child's foreign-key columns, on every delete from the parent table, whichever row is deleted [Verified-doc <https://www.postgresql.org/docs/18/ddl-constraints.html#DDL-CONSTRAINTS-FK>]. `product_variants` and `inventory_items` are such parents, because a never-stocked variant and its `(0, 0)` row are hard-deleted (§7.9, §8.1), so every foreign key to them is indexed except `cart_items.variant_id` (§10.2). Foreign keys to rows that are never deleted (users, shops, orders) never trigger a RESTRICT check, so an index would cost insert time for nothing.

### 8.1 `inventory_items`

**Module** `inventory` · **Release** R1 · **Shop scope** `shop_id`, composite FK to the variant · **Lifecycle** Entity (projection) · **Sensitivity** Internal

One row per variant: units on the shelf (`on_hand`) and units promised to open orders (`reserved`). Available stock, `on_hand − reserved`, is never stored. The table replaces the single unconstrained `product_variants.quantity` integer of RF-14 [Verified-repo `database/migrations/1780072881100_create_product_variants_table.ts:19`].

| Column       | Type        | Null | Default | Notes                                                                                                                   |
| ------------ | ----------- | ---- | ------- | ----------------------------------------------------------------------------------------------------------------------- |
| `variant_id` | uuid        | no   | App     | Primary key. Inserted in the transaction that creates the variant (§7.9), with `on_hand = 0`                            |
| `shop_id`    | uuid        | no   | App     | Copied from the variant row the action has loaded, never from input ([04 §2.5](04-domain-model-and-data-dictionary.md)) |
| `on_hand`    | int         | no   | `0`     | Units held by the shop and not yet shipped                                                                              |
| `reserved`   | int         | no   | `0`     | Σ `quantity` of the variant's `held` and `committed` reservations                                                       |
| `version`    | int         | no   | `1`     | Incremented by every conditional update ([04 §2.10](04-domain-model-and-data-dictionary.md))                            |
| `created_at` | timestamptz | no   | `now()` |                                                                                                                         |
| `updated_at` | timestamptz | no   | `now()` | Maintained by trigger ([04 §2.2](04-domain-model-and-data-dictionary.md))                                               |

**Keys and constraints.**

```sql
CONSTRAINT inventory_items_pkey PRIMARY KEY (variant_id),
CONSTRAINT inventory_items_variant_id_shop_id_key UNIQUE (variant_id, shop_id),  -- target for §8.2, §8.3
CONSTRAINT inventory_items_variant_fkey FOREIGN KEY (variant_id, shop_id)
  REFERENCES product_variants (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT inventory_items_on_hand_check  CHECK (on_hand >= 0),
CONSTRAINT inventory_items_reserved_check CHECK (reserved >= 0 AND reserved <= on_hand)
```

The table is created `WITH (fillfactor = 80)` ([04 §17.1](04-domain-model-and-data-dictionary.md) rule 5):

```sql
CREATE TABLE inventory_items ( /* columns and constraints above */ ) WITH (fillfactor = 80);
```

Every checkout updates `reserved`, `version` and `updated_at`, and none of them is indexed, so the update can be a heap-only tuple (HOT) update that skips index maintenance, provided the page has room for the new row version [Verified-doc <https://www.postgresql.org/docs/18/storage-hot.html>]. The 20% free space per page is that room. Cost: about 25% more pages on a table of one row per variant. Verification: `pg_stat_user_tables.n_tup_hot_upd` close to `n_tup_upd` for this table under the T-PERF-001 checkout load.

`inventory_items_reserved_check` is the oversell backstop. Checkout's guard `WHERE on_hand - reserved >= :qty` ([05 §4.5](05-order-payment-and-inventory-lifecycles.md#45-the-conditional-stock-update)) is what normally refuses the last unit. If a future code path forgets that guard, the UPDATE fails with SQLSTATE 23514 and the transaction rolls back, so the promise is never stored. The cost is one comparison per update. T-INV-001 (proposed) removes the guard in a test double and expects 23514. T-INV-003 proves the guarded path under concurrency. `int` holds 2.1 × 10^9 units per variant, far beyond any shop; only money uses `bigint`.

**Indexes.**

| Index                                    | Definition              | Query served                                                                                                                                                                     |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_items_pkey`                   | `(variant_id)`          | Checkout reserve: `UPDATE … WHERE variant_id = :v AND shop_id = :s AND on_hand - reserved >= :q`; PDP availability: `WHERE variant_id = ANY(:ids)`; listing refresh (`in_stock`) |
| `inventory_items_variant_id_shop_id_key` | `(variant_id, shop_id)` | Foreign-key target only                                                                                                                                                          |

There is no `shop_id` index. The seller inventory page (`listInventory`) is driven by `products_seller_list_idx` of §7.6 and pages by product: the cursor is the product's `(updated_at, id)`, each row carries all of that product's active variants, and their rows here are joined by primary key.

**Lifecycle and retention.** Created with the variant. Initial stock is entered as an `adjustment` movement with reason `received_stock`, so the journal sums are complete from the first unit ([05 §5.1](05-order-payment-and-inventory-lifecycles.md#51-model-and-invariants)). Archived variants keep their row, because a return or RTO can restock into it ([05 §5.7](05-order-payment-and-inventory-lifecycles.md#57-return-restock)). The one delete: when a variant with no inventory movement and no order line, of a product in any status, is hard-deleted ([04 §2.6](04-domain-model-and-data-dictionary.md), §7.9), its `(0, 0)` row is deleted first in the same transaction, after `replaceProductVariants` has locked it. Once any movement exists, the RESTRICT foreign key from §8.3 makes that delete fail (SQLSTATE 23001), and `inventory_reservations_variant_idx` (§8.2) serves the RESTRICT check of the reservations. The row's history is retained in §8.3.

**Sensitivity.** Internal. Exact `on_hand` is shop-confidential. The storefront receives `in_stock` and, below a threshold, "only N left" ([08](08-ui-ux-and-design-system.md)).

### 8.2 `inventory_reservations`

**Module** `inventory` · **Release** R1 (`held` and `expires_at` used from R1.1) · **Shop scope** `shop_id`, composite FKs · **Lifecycle** Record · **Sensitivity** Internal

One row per order item, or per remainder after a partial release. COD reservations start `committed`. Gateway reservations start `held` with an expiry ([05 §5.3](05-order-payment-and-inventory-lifecycles.md#53-creating-reservations)).

| Column          | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                          |
| --------------- | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                |
| `shop_id`       | uuid        | no   | App        | From the order item                                                                                                                                                                                                                                                                            |
| `variant_id`    | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                |
| `order_id`      | uuid        | no   | App        | Lets cancellation and the expiry job find an order's holds under the parent-row lock                                                                                                                                                                                                           |
| `order_item_id` | uuid        | no   | App        | NOT NULL here: every R1 and R1.1 reservation comes from an order item                                                                                                                                                                                                                          |
| `quantity`      | int         | no   | App        | Never changes. A partial release marks the row `released` and inserts a new row for the remainder ([05 §5.5](05-order-payment-and-inventory-lifecycles.md#55-release))                                                                                                                         |
| `status`        | text        | no   | App        | `held`, `committed`, `released`, `consumed`                                                                                                                                                                                                                                                    |
| `expires_at`    | timestamptz | yes  | —          | Only while `held`: at placement `now() + reservation_ttl_minutes + 10 min`; after initiation, provider session expiry + 10 minutes; never beyond `orders.placed_at + 90 min` [Assumption, [05 §5.3](05-order-payment-and-inventory-lifecycles.md#53-creating-reservations)]. Cleared on commit |
| `resolved_at`   | timestamptz | yes  | —          | Set on `released` or `consumed`                                                                                                                                                                                                                                                                |
| `created_at`    | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                |
| `updated_at`    | timestamptz | no   | `now()`    | Trigger                                                                                                                                                                                                                                                                                        |

**Keys and constraints.**

```sql
CONSTRAINT inventory_reservations_pkey PRIMARY KEY (id),
CONSTRAINT inventory_reservations_status_check
  CHECK (status IN ('held', 'committed', 'released', 'consumed')),
CONSTRAINT inventory_reservations_quantity_check CHECK (quantity > 0),
CONSTRAINT inventory_reservations_expiry_check CHECK (
     (status = 'held'      AND expires_at IS NOT NULL)
  OR (status = 'committed' AND expires_at IS NULL)
  OR  status IN ('released', 'consumed')),
CONSTRAINT inventory_reservations_resolved_check
  CHECK ((status IN ('released', 'consumed')) = (resolved_at IS NOT NULL)),
CONSTRAINT inventory_reservations_stock_fkey FOREIGN KEY (variant_id, shop_id)
  REFERENCES inventory_items (variant_id, shop_id) ON DELETE RESTRICT,
CONSTRAINT inventory_reservations_order_item_fkey
  FOREIGN KEY (order_item_id, order_id, shop_id, variant_id)
  REFERENCES order_items (id, order_id, shop_id, variant_id) ON DELETE RESTRICT
```

The four-column foreign key targets `order_items_reservation_ref_key` (§11.3). One constraint proves that the reservation's order, shop and variant are exactly those of its order item. A reservation that holds shop B's variant against shop A's order line fails with SQLSTATE 23503 (T-ORD-104, proposed).

```sql
-- At most one open reservation per order item
CREATE UNIQUE INDEX inventory_reservations_open_item_key
  ON inventory_reservations (order_item_id) WHERE status IN ('held', 'committed');
```

The partial release of [05 §5.5](05-order-payment-and-inventory-lifecycles.md#55-release) releases the old row before it inserts the remainder. A bug that forgets the release gets 23505 instead of counting the same units twice in `reserved`. T-INV-102 (proposed).

**Indexes.**

| Index                                     | Definition                                                             | Query served                                                                                                                                                                                                                                                                                                         |
| ----------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_reservations_open_item_key`    | `(order_item_id) WHERE status IN ('held','committed')`                 | Shipment consume and item-level rejection: `WHERE order_item_id = ANY(:items) AND status IN ('held','committed')`                                                                                                                                                                                                    |
| `inventory_reservations_open_order_idx`   | `(order_id) WHERE status IN ('held','committed')`                      | Release or commit for one order under the parent lock; the expiry job's `EXISTS (… WHERE r.order_id = p.order_id AND r.status = 'held' AND r.expires_at <= now())` ([05 §5.4](05-order-payment-and-inventory-lifecycles.md#54-expiration-job))                                                                       |
| `inventory_reservations_held_expiry_idx`  | `(expires_at) WHERE status = 'held'`                                   | Expiry job cases A and C: `WHERE status = 'held' AND expires_at <= :cutoff`                                                                                                                                                                                                                                          |
| `inventory_reservations_open_variant_idx` | `(variant_id) INCLUDE (quantity) WHERE status IN ('held','committed')` | Drift check: `SUM(quantity) … GROUP BY variant_id`, index-only                                                                                                                                                                                                                                                       |
| `inventory_reservations_variant_idx`      | `(variant_id)`                                                         | The RESTRICT check of `inventory_reservations_stock_fkey` (`WHERE variant_id = $1 AND shop_id = $2`, with no status condition) when a never-stocked variant's `(0, 0)` `inventory_items` row is deleted (§7.9, §8.1). A variant belongs to one shop, so `variant_id` alone narrows the lookup to that variant's rows |

The first four are partial. Only open reservations are indexed, and after a few weeks almost every row is closed, so those indexes stay small no matter how many orders accumulate. `inventory_reservations_variant_idx` is the one full index: a partial index cannot serve a lookup without its status condition, so without it every hard delete of a never-stocked variant would scan the whole table, about one row per order line, kept 7 years.

**Lifecycle and retention.** Inserted by checkout step 9, by the late-capture re-reserve ([05 §8.4](05-order-payment-and-inventory-lifecycles.md#84-payment-success-after-reservation-expiry-r11)) and, as the remainder row of a partial release, by `releaseForOrderItems` ([05 §5.5](05-order-payment-and-inventory-lifecycles.md#55-release)), which writes no `reserve` movement for it. Status changes only by compare-and-set. Never deleted. Retained with the order record, 7 years after the order's last shop order became terminal ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]), because it explains the stock history of a disputed order.

### 8.3 `inventory_movements`

**Module** `inventory` · **Release** R1 · **Shop scope** `shop_id`, composite FK · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (`actor_user_id` is Personal when joined)

One row per change to `on_hand` or `reserved`, written in the same transaction as the change. Kinds, deltas and reason codes are listed in [05 §5.2](05-order-payment-and-inventory-lifecycles.md#52-movement-kinds). Rules in [05 §5.11](05-order-payment-and-inventory-lifecycles.md#511-rules-for-inventory_movements).

| Column           | Type        | Null | Default    | Notes                                                                                                                                                                      |
| ---------------- | ----------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | no   | `uuidv7()` | Time-ordered; tie-breaker for history pages                                                                                                                                |
| `shop_id`        | uuid        | no   | App        |                                                                                                                                                                            |
| `variant_id`     | uuid        | no   | App        |                                                                                                                                                                            |
| `kind`           | text        | no   | App        | `reserve`, `release`, `commit`, `ship`, `return_restock`, `rto_restock`, `adjustment`, `stocktake`, `correction`                                                           |
| `on_hand_delta`  | int         | no   | App        | Signed                                                                                                                                                                     |
| `reserved_delta` | int         | no   | App        | Signed                                                                                                                                                                     |
| `reason_code`    | text        | no   | App        | Vocabulary per kind in `app/modules/inventory/domain/movement_reasons.ts` ([05 §5.2](05-order-payment-and-inventory-lifecycles.md#52-movement-kinds)); vendors see a label |
| `note`           | text        | yes  | —          | Vendor or admin text, at most 500 characters                                                                                                                               |
| `actor_user_id`  | uuid        | yes  | —          | The person who caused it; null for jobs                                                                                                                                    |
| `reference_type` | text        | no   | App        | `inventory_reservation`, `shipment`, `return_request`, `request`, `audit_log`                                                                                              |
| `reference_id`   | text        | no   | App        | The referenced row's id as text: a UUID, or the `audit_logs.id` bigint for `correction`. For `request` it is the `idempotency_keys.id` of the adjustment call              |
| `request_id`     | text        | yes  | —          | `X-Request-Id` or the job's correlation id                                                                                                                                 |
| `created_at`     | timestamptz | no   | `now()`    |                                                                                                                                                                            |

`reference_id` is polymorphic, so it has no foreign key. The two reference CHECKs below and the exactly-once index do the work a foreign key cannot.

`inventory_movements_reason_code_check` fixes the reasons a person can choose, per [05 §5.2](05-order-payment-and-inventory-lifecycles.md#52-movement-kinds): the six vendor adjustment reasons, `stocktake`, and the admin-only `correction` kind with reason `drift_repair`. Reasons of the movements that the system writes (`reserve`, `release`, `commit`, `ship`, the restocks) are listed in 05 as examples and come from code constants, so only their format is checked. A new vendor reason therefore needs a migration that replaces the CHECK ([04 §2.4](04-domain-model-and-data-dictionary.md)), which keeps the database, the validator and the vendor labels in step (T-ARCH-011, proposed).

**Keys and constraints.**

```sql
CONSTRAINT inventory_movements_pkey PRIMARY KEY (id),
CONSTRAINT inventory_movements_kind_check CHECK (kind IN ('reserve', 'release', 'commit', 'ship',
  'return_restock', 'rto_restock', 'adjustment', 'stocktake', 'correction')),
CONSTRAINT inventory_movements_deltas_check CHECK (CASE kind
  WHEN 'reserve'        THEN on_hand_delta = 0 AND reserved_delta > 0
  WHEN 'release'        THEN on_hand_delta = 0 AND reserved_delta < 0
  WHEN 'commit'         THEN on_hand_delta = 0 AND reserved_delta = 0
  WHEN 'ship'           THEN on_hand_delta < 0 AND reserved_delta = on_hand_delta
  WHEN 'return_restock' THEN on_hand_delta > 0 AND reserved_delta = 0
  WHEN 'rto_restock'    THEN on_hand_delta > 0 AND reserved_delta = 0
  WHEN 'adjustment'     THEN on_hand_delta <> 0 AND reserved_delta = 0
  WHEN 'stocktake'      THEN reserved_delta = 0            -- a confirming count may be 0
  ELSE true END),                                          -- 'correction' repairs the journal (05 §5.10)
CONSTRAINT inventory_movements_reference_check CHECK (
     (kind IN ('reserve', 'release', 'commit') AND reference_type = 'inventory_reservation')
  OR (kind IN ('ship', 'rto_restock')          AND reference_type = 'shipment')
  OR (kind = 'return_restock'                  AND reference_type = 'return_request')
  OR (kind IN ('adjustment', 'stocktake')      AND reference_type = 'request')
  OR (kind = 'correction'                      AND reference_type = 'audit_log')),
CONSTRAINT inventory_movements_reference_id_check CHECK (
     reference_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  OR (reference_type = 'audit_log' AND reference_id ~ '^[0-9]{1,19}$')),
CONSTRAINT inventory_movements_reason_code_check CHECK (reason_code ~ '^[a-z][a-z_]{2,39}$' AND CASE kind
  WHEN 'adjustment' THEN reason_code IN ('received_stock', 'damaged', 'lost', 'found', 'sold_offline',
                                         'data_entry_error')
  WHEN 'stocktake'  THEN reason_code = 'stocktake'
  WHEN 'correction' THEN reason_code = 'drift_repair'
  ELSE true END),                  -- system kinds: format only (05 §5.2 lists examples)
CONSTRAINT inventory_movements_note_check CHECK (note IS NULL OR char_length(note) <= 500),
CONSTRAINT inventory_movements_stock_fkey FOREIGN KEY (variant_id, shop_id)
  REFERENCES inventory_items (variant_id, shop_id) ON DELETE RESTRICT,
CONSTRAINT inventory_movements_actor_fkey FOREIGN KEY (actor_user_id)
  REFERENCES users (id) ON DELETE RESTRICT
```

```sql
-- Each order-driven stock effect happens exactly once
CREATE UNIQUE INDEX inventory_movements_reference_once_key
  ON inventory_movements (reference_type, reference_id, variant_id, kind)
  WHERE kind IN ('reserve', 'release', 'commit', 'ship', 'return_restock', 'rto_restock');
```

pg-boss may run a job twice [Verified-doc <https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md>], and a vendor on a slow connection may submit "returned to origin" twice. The stock effect must still happen once. With this index a second restock for the same shipment and variant fails with 23505, the action treats that as "already done" and the transaction rolls back cleanly. It relies on one order line per variant per shop order (`order_items_shop_order_variant_key`, §11.3). Adjustments and stocktakes are excluded because their idempotency key already protects them. The append-only triggers of [04 §2.12](04-domain-model-and-data-dictionary.md) apply. Tests (all proposed): T-INV-006 (append-only), T-INV-101 (delta and reason CHECKs per kind, exactly-once restock).

**Indexes.**

| Index                                     | Definition                                                                       | Query served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_movements_variant_history_idx` | `(variant_id, created_at DESC, id DESC) INCLUDE (on_hand_delta, reserved_delta)` | Vendor stock history: `WHERE variant_id = :v AND shop_id = :s ORDER BY created_at DESC, id DESC LIMIT 50`; drift check sums per variant as an index-only scan; the "any movement for this variant?" check of `replaceProductVariants` (§7.9) and the RESTRICT check of `inventory_movements_stock_fkey` when a never-stocked variant's row is deleted (§8.1), through the leading `variant_id`                                                                                                                                                                                                                                                    |
| `inventory_movements_reference_once_key`  | above                                                                            | Exactly-once guard; "was this return already restocked": `WHERE reference_type = 'return_request' AND reference_id = :r AND kind = 'return_restock'`, and for a shipment `kind IN ('ship','rto_restock')`. Every lookup on this index names its kind as a literal: the planner uses a partial index only when the query's `WHERE` implies the index predicate, and it does not use the reference CHECK for that proof [Verified-doc <https://www.postgresql.org/docs/18/indexes-partial.html>], so without the kind the lookup scans the journal. The `EXPLAIN` of [04 §17.1](04-domain-model-and-data-dictionary.md) rule 7 shows the index scan |

**Lifecycle and retention.** Insert-only. Volume at the 10× design load of A-02 (20,000 orders a month, about 2 lines each, about 3 movements per line) is roughly 120,000 rows a month, about 7 million in five years. That needs no partitioning. Retained for 7 years with the order records they explain ([05 §5.11](05-order-payment-and-inventory-lifecycles.md#511-rules-for-inventory_movements), [04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]). Only the retention maintenance command deletes rows, through the retention exemption of `forbid_mutation()` (proposed, [04 §2.12](04-domain-model-and-data-dictionary.md)).

---

## 9. Logistics and locations

The `logistics` module owns the national location reference data and each shop's delivery configuration. The address tables that use the codes are §5.5 (`user_addresses`) and §6.6 (`shop_addresses`). The seed dataset and its source are [04 §21.4](04-domain-model-and-data-dictionary.md) and [04 §21.5](04-domain-model-and-data-dictionary.md).

**Codes.** Nepal Post's federal postal codes give every local level a 5-digit code made of a province digit, a 2-digit district number and a 2-digit local-level number, and every ward a 7-digit code (the local-level code plus a 2-digit ward). Kathmandu Metropolitan City is `30608`, with wards `3060801` to `3060832` [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/Postal%20Code_wteggid.pdf>]. DripNepal uses the first digit as the province code and the first three digits as the district code (`3` Bagmati, `306` Kathmandu, `307` Bhaktapur, `308` Lalitpur). A CHECK then proves that every code sits inside its parent. The counts to seed are 7 provinces, 77 districts and 753 local levels with 6,743 wards (canon §17.8). Whether this list is the authoritative dataset to build on is [Verify-external VX-10].

**Why codes as primary keys.** The code is what seeders, address snapshots and API filters (`?province=3`) use, and it does not change ([04 §2.1](04-domain-model-and-data-dictionary.md)). Codes are `text`, not integers, because they are identifiers with positional meaning, not numbers.

**Changes.** If the government merges or renames a local level, the new code is inserted and the old row gets `is_active = false`. Saved addresses that use the old code stay valid (RESTRICT), and order snapshots already carry the names.

The location tables are tiny (at most 753 rows in a handful of 8 KB pages). They have no secondary indexes: at this size a sequential scan is as fast as an index lookup, and the index would only add maintenance.

### 9.1 `provinces`

**Module** `logistics` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

| Column                     | Type        | Null | Default | Notes                                                                           |
| -------------------------- | ----------- | ---- | ------- | ------------------------------------------------------------------------------- |
| `code`                     | text        | no   | App     | Primary key, `1`–`7`                                                            |
| `name_en`                  | text        | no   | App     | `Koshi`, `Madhesh`, `Bagmati`, `Gandaki`, `Lumbini`, `Karnali`, `Sudurpashchim` |
| `name_ne`                  | text        | no   | App     | Devanagari, NFC-normalised ([04 §2.8](04-domain-model-and-data-dictionary.md))  |
| `is_active`                | boolean     | no   | `true`  |                                                                                 |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                 |

**Keys and constraints.** `provinces_pkey PRIMARY KEY (code)`; `provinces_code_check CHECK (code ~ '^[1-7]$')`; `provinces_name_check CHECK (char_length(name_en) BETWEEN 2 AND 60 AND char_length(name_ne) BETWEEN 1 AND 60)`.

**Indexes.** Primary key only. `listProvinces` reads all seven rows.

**Lifecycle and retention.** Seeded by the reference seeder ([04 §20.3](04-domain-model-and-data-dictionary.md)). Changed only by a reviewed seeder or migration. Never deleted.

### 9.2 `districts`

**Module** `logistics` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

| Column                     | Type        | Null | Default | Notes                                                                             |
| -------------------------- | ----------- | ---- | ------- | --------------------------------------------------------------------------------- |
| `code`                     | text        | no   | App     | Primary key, 3 digits, for example `306` Kathmandu                                |
| `province_code`            | text        | no   | App     |                                                                                   |
| `name_en`, `name_ne`       | text        | no   | App     | Nawalparasi and Rukum are each two districts in different provinces (canon §17.8) |
| `is_active`                | boolean     | no   | `true`  |                                                                                   |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                   |

**Keys and constraints.**

```sql
CONSTRAINT districts_pkey PRIMARY KEY (code),
CONSTRAINT districts_code_check CHECK (code ~ '^[1-7][0-9]{2}$'),
CONSTRAINT districts_code_prefix_check CHECK (left(code, 1) = province_code),
CONSTRAINT districts_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT,
CONSTRAINT districts_code_province_code_key UNIQUE (code, province_code)   -- target of address composite FKs (04 §2.5)
```

**Indexes.** Primary key and the unique key. `listDistricts?province=` scans 77 rows.

**Lifecycle and retention.** As §9.1.

### 9.3 `local_levels`

**Module** `logistics` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

| Column                     | Type        | Null | Default | Notes                                                                                                                              |
| -------------------------- | ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `code`                     | text        | no   | App     | Primary key, the Nepal Post 5-digit code                                                                                           |
| `district_code`            | text        | no   | App     |                                                                                                                                    |
| `name_en`, `name_ne`       | text        | no   | App     |                                                                                                                                    |
| `type`                     | text        | no   | App     | `metropolitan`, `sub_metropolitan`, `municipality`, `rural_municipality` (6 / 11 / 276 / 460 [Verified-doc Nepal Post list above]) |
| `ward_count`               | smallint    | no   | App     | Address validators check `ward_no ≤ ward_count` (§5.5, §6.6)                                                                       |
| `is_active`                | boolean     | no   | `true`  |                                                                                                                                    |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                                                                    |

**Keys and constraints.**

```sql
CONSTRAINT local_levels_pkey PRIMARY KEY (code),
CONSTRAINT local_levels_code_check CHECK (code ~ '^[1-7][0-9]{4}$'),
CONSTRAINT local_levels_code_prefix_check CHECK (left(code, 3) = district_code),
CONSTRAINT local_levels_type_check
  CHECK (type IN ('metropolitan', 'sub_metropolitan', 'municipality', 'rural_municipality')),
CONSTRAINT local_levels_ward_count_check CHECK (ward_count BETWEEN 1 AND 40),  -- largest today: Pokhara, 33
CONSTRAINT local_levels_district_fkey FOREIGN KEY (district_code) REFERENCES districts (code) ON DELETE RESTRICT,
CONSTRAINT local_levels_code_district_code_key UNIQUE (code, district_code)
```

The ward's 7-digit postal code is `code || lpad(ward_no::text, 2, '0')`, so customers are never asked for a postal code. The Nepal Post notice also lists special counter codes that are not wards [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/IMG_20250604_0002_ejntwer.pdf>], which is why the code is derived and not validated against user input.

**Indexes.** Primary key and the unique key. `listLocalLevels?district=` scans 753 rows.

**Lifecycle and retention.** As §9.1.

### 9.4 `delivery_zones`

**Module** `logistics` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

| Column                     | Type        | Null | Default | Notes                                                                                                              |
| -------------------------- | ----------- | ---- | ------- | ------------------------------------------------------------------------------------------------------------------ |
| `code`                     | text        | no   | App     | Primary key: `ktm_valley`, `outside_valley` [Assumption A-27] ([04 §21.5](04-domain-model-and-data-dictionary.md)) |
| `name_en`                  | text        | no   | App     |                                                                                                                    |
| `name_ne`                  | text        | yes  | —       | Filled for the R2 Nepali UI                                                                                        |
| `position`                 | smallint    | no   | `0`     | Display order in the shop shipping editor                                                                          |
| `is_active`                | boolean     | no   | `true`  |                                                                                                                    |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                                                    |

**Keys and constraints.** `delivery_zones_pkey PRIMARY KEY (code)`; `delivery_zones_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$')`.

**Indexes.** Primary key only.

**Lifecycle and retention.** Adding a zone makes every shop's rate table incomplete until vendors add a rate, so a new zone is released together with a data migration or a vendor notice. Never deleted.

### 9.5 `delivery_zone_districts`

**Module** `logistics` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

| Column          | Type        | Null | Default | Notes |
| --------------- | ----------- | ---- | ------- | ----- |
| `zone_code`     | text        | no   | App     |       |
| `district_code` | text        | no   | App     |       |
| `created_at`    | timestamptz | no   | `now()` |       |

**Keys and constraints.**

```sql
CONSTRAINT delivery_zone_districts_pkey PRIMARY KEY (zone_code, district_code),
CONSTRAINT delivery_zone_districts_district_key UNIQUE (district_code),   -- a district is in at most one zone
CONSTRAINT delivery_zone_districts_zone_fkey FOREIGN KEY (zone_code)
  REFERENCES delivery_zones (code) ON DELETE RESTRICT,
CONSTRAINT delivery_zone_districts_district_fkey FOREIGN KEY (district_code)
  REFERENCES districts (code) ON DELETE RESTRICT
```

"At most one zone" is the unique key. "At least one zone" cannot be a constraint on this table, so the reference-data test T-SHOP-108 (proposed) asserts that every active district has exactly one zone after seeding.

**Indexes.** `delivery_zone_districts_district_key` serves the checkout zone lookup `SELECT zone_code … WHERE district_code = :d`.

**Lifecycle and retention.** Moving a district to another zone changes fees for future quotes only. Placed shop orders keep their fee and zone snapshot (§11.2).

### 9.6 `shop_delivery_coverage`

**Module** `logistics` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Configuration · **Sensitivity** Internal (shown publicly as "Delivers to" on the shop page)

The districts a shop delivers to (FR-SHOP-004). Checkout refuses an address outside it with 422 `DELIVERY_NOT_AVAILABLE` ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order)).

| Column          | Type        | Null | Default | Notes                      |
| --------------- | ----------- | ---- | ------- | -------------------------- |
| `shop_id`       | uuid        | no   | App     | Resolved from `{shopSlug}` |
| `district_code` | text        | no   | App     |                            |
| `created_at`    | timestamptz | no   | `now()` |                            |

**Keys and constraints.** `shop_delivery_coverage_pkey PRIMARY KEY (shop_id, district_code)`; `shop_delivery_coverage_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT`; `shop_delivery_coverage_district_fkey FOREIGN KEY (district_code) REFERENCES districts (code) ON DELETE RESTRICT`.

**Indexes.**

| Index                         | Definition                 | Query served                                                                                                        |
| ----------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `shop_delivery_coverage_pkey` | `(shop_id, district_code)` | Checkout coverage: `WHERE shop_id = ANY(:shops) AND district_code = :d`; seller shipping page: `WHERE shop_id = :s` |

Not created: `(district_code, shop_id)` for a "shops that deliver to me" filter. That filter is R2.

**Lifecycle and retention.** `replaceShopShipping` (⟳, `If-Match` on `shops.version`) deletes and re-inserts the shop's coverage and rates in one transaction and writes one `audit_logs` row with the before and after sets. Hard delete is allowed ([04 §2.6](04-domain-model-and-data-dictionary.md)). Open orders are unaffected because their fee and zone are snapshotted. The 1-year purge of an application that was never approved deletes its rows, and the retention command deletes a closed shop's rows 7 years after `closed_at` (§6.1). The cross-table rule "every covered district's zone has a rate" is checked by `replaceShopShipping`, and checkout treats a missing rate as `DELIVERY_NOT_AVAILABLE` rather than free delivery ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order)). T-SHOP-109 (proposed).

### 9.7 `shop_shipping_rates`

**Module** `logistics` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Configuration · **Sensitivity** Public (fees and estimates are shown before checkout)

One flat fee and delivery estimate per shop per zone [Assumption A-27].

| Column                         | Type        | Null | Default | Notes                                       |
| ------------------------------ | ----------- | ---- | ------- | ------------------------------------------- |
| `shop_id`                      | uuid        | no   | App     |                                             |
| `zone_code`                    | text        | no   | App     |                                             |
| `fee_minor`                    | bigint      | no   | App     | Paisa. `0` means free delivery to that zone |
| `currency`                     | char(3)     | no   | `'NPR'` |                                             |
| `est_min_days`, `est_max_days` | smallint    | no   | App     | Delivery estimate in days                   |
| `created_at`, `updated_at`     | timestamptz | no   | `now()` |                                             |

**Keys and constraints.**

```sql
CONSTRAINT shop_shipping_rates_pkey PRIMARY KEY (shop_id, zone_code),
CONSTRAINT shop_shipping_rates_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT shop_shipping_rates_zone_fkey FOREIGN KEY (zone_code)
  REFERENCES delivery_zones (code) ON DELETE RESTRICT,
CONSTRAINT shop_shipping_rates_fee_check CHECK (fee_minor >= 0),
CONSTRAINT shop_shipping_rates_currency_check CHECK (currency = 'NPR'),
CONSTRAINT shop_shipping_rates_estimate_check
  CHECK (est_min_days >= 0 AND est_max_days >= est_min_days AND est_max_days <= 30)  -- 30: [Assumption]
```

The estimate is the "delivery date and time" disclosure of E-Commerce Act 2081 s6 [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; obligations Verify-external VX-02]. It is shown on the product page and at checkout and copied onto the shop order. The fee is the only transport charge the customer pays for that parcel: Directive 2082 s8(3) bars collecting anything beyond the price and the transport cost fixed before the sale [Verify-external VX-02]. That is why no table has a COD-fee column.

**Indexes.** `shop_shipping_rates_pkey` serves checkout pricing `WHERE shop_id = ANY(:shops) AND zone_code = :z` and the seller shipping page.

**Lifecycle and retention.** As §9.6.

---

## 10. Cart

The `cart` module owns a server-side cart for guests and signed-in users (FR-CART-001 to 003). A cart spans shops, so it is not shop-scoped: a line's shop is its variant's shop. The cart never holds money truth. `unit_price_minor_at_add` only drives the "price changed since you added this" notice (FR-CART-002). Checkout reprices every line from `product_variants` ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step), step 6).

### 10.1 `carts`

**Module** `cart` · **Release** R1 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Personal (`guest_token_hash` is Secret)

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                    |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                          |
| `user_id`                  | uuid        | yes  | —          | Owner when signed in                                                                                                                                                     |
| `guest_token_hash`         | bytea       | yes  | —          | SHA-256 of the 32 random bytes in the httpOnly `dripnepal_cart` cookie. Neither the raw token nor the session id is stored (fixes RF-19, IAM-19)                         |
| `status`                   | text        | no   | `'active'` | `active`, `converted`, `abandoned`, `merged`                                                                                                                             |
| `version`                  | int         | no   | `1`        | Incremented on every line change. Checkout compares it with the quote's `cart_version` ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step), step 3) |
| `expires_at`               | timestamptz | no   | App        | Last activity + 30 days for guests (AC-FR-CART-001-1), + 90 days for signed-in users [Assumption]. Pushed forward by every mutation                                      |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                          |

A plain SHA-256 is enough for the guest token because the token carries 256 bits of entropy and cannot be guessed. A keyed hash is needed only for low-entropy values such as phone numbers ([04 §2.9](04-domain-model-and-data-dictionary.md)).

**Keys and constraints.**

```sql
CONSTRAINT carts_pkey PRIMARY KEY (id),
CONSTRAINT carts_status_check CHECK (status IN ('active', 'converted', 'abandoned', 'merged')),
CONSTRAINT carts_owner_check CHECK (user_id IS NOT NULL OR guest_token_hash IS NOT NULL),
CONSTRAINT carts_guest_token_hash_check
  CHECK (guest_token_hash IS NULL OR octet_length(guest_token_hash) = 32),
CONSTRAINT carts_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT
```

```sql
CREATE UNIQUE INDEX carts_active_user_key  ON carts (user_id)          WHERE status = 'active';
CREATE UNIQUE INDEX carts_active_guest_key ON carts (guest_token_hash) WHERE status = 'active';
```

One active cart per user and per guest token. Today nothing stops two tabs on a slow connection from creating two carts for one user, after which items seem to vanish (F16). `getOrCreateCart` inserts with `ON CONFLICT (user_id) WHERE status = 'active' DO NOTHING` and then selects, so a race ends with one cart. T-CART-101 (proposed).

**Indexes.**

| Index                    | Definition                              | Query served                                                                                                                                                         |
| ------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `carts_active_user_key`  | above                                   | `getCart` for a signed-in user; checkout step 3 `SELECT … WHERE user_id = :u AND status = 'active' FOR UPDATE`                                                       |
| `carts_active_guest_key` | above                                   | `getCart` for a guest: `WHERE guest_token_hash = :h AND status = 'active'`                                                                                           |
| `carts_expiry_idx`       | `(expires_at) WHERE status = 'active'`  | `cart.expire_abandoned` ([03 §9](03-system-architecture.md#9-asynchronous-work)): `UPDATE … SET status = 'abandoned' WHERE status = 'active' AND expires_at < now()` |
| `carts_purge_idx`        | `(updated_at) WHERE status <> 'active'` | `platform.retention_purge` (proposed): `DELETE FROM carts WHERE status <> 'active' AND updated_at < now() - interval '30 days'`                                      |

**No `fillfactor` setting.** [04 §17.1](04-domain-model-and-data-dictionary.md) rule 5 proposes `fillfactor = 80` for `carts` as well. It is not applied: every cart mutation changes `expires_at` and `updated_at`, and both are indexed (`carts_expiry_idx`, `carts_purge_idx`; a partial index counts even when the row is outside its predicate), so a cart update can never be a HOT update and the free space would only add pages [Verified-doc <https://www.postgresql.org/docs/18/storage-hot.html>]. A cart row changes a few times per session, far less often than `inventory_items`.

**Merge on login** (AC-FR-CART-001-3). In one transaction, both carts are locked `FOR UPDATE` in `id` order. Each guest line is upserted into the user's cart with `quantity = LEAST(10, a + b)`, within the 50-line cap, and the guest cart becomes `merged`. A second login finds no active guest cart, so merging is idempotent. If the user has no active cart, the guest cart is adopted instead: `user_id` is set and `guest_token_hash` cleared. If a user cart is created at the same moment, the adoption fails on `carts_active_user_key`; the merge then retries once and merges into that cart, so the violation never reaches the client ([04 §16.5](04-domain-model-and-data-dictionary.md)).

**Lifecycle and retention.** `converted` in the checkout transaction, `abandoned` by the expiry job, `merged` at login. Hard-deleted 30 days after leaving `active` by `platform.retention_purge` [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)], with `cart_items` cascading ([04 §2.6](04-domain-model-and-data-dictionary.md)). No order references a cart, so the purge never touches history.

### 10.2 `cart_items`

**Module** `cart` · **Release** R1 · **Shop scope** none (the variant's shop) · **Lifecycle** Ephemeral · **Sensitivity** Personal

| Column                     | Type        | Null | Default    | Notes                                                                                               |
| -------------------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` | The `{cartItemId}` of `updateCartItem` and `removeCartItem`                                         |
| `cart_id`                  | uuid        | no   | App        |                                                                                                     |
| `variant_id`               | uuid        | no   | App        |                                                                                                     |
| `quantity`                 | int         | no   | App        | 1–10 (AC-FR-CART-001-2)                                                                             |
| `unit_price_minor_at_add`  | bigint      | no   | App        | Read from `product_variants.price_minor` when the line is added, never from the request (T-SEC-003) |
| `currency`                 | char(3)     | no   | `'NPR'`    |                                                                                                     |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                     |

**Keys and constraints.**

```sql
CONSTRAINT cart_items_pkey PRIMARY KEY (id),
CONSTRAINT cart_items_cart_fkey FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
CONSTRAINT cart_items_variant_fkey FOREIGN KEY (variant_id)
  REFERENCES product_variants (id) ON DELETE RESTRICT,
CONSTRAINT cart_items_cart_variant_key UNIQUE (cart_id, variant_id),
CONSTRAINT cart_items_quantity_check CHECK (quantity BETWEEN 1 AND 10),
CONSTRAINT cart_items_unit_price_check CHECK (unit_price_minor_at_add >= 0),
CONSTRAINT cart_items_currency_check CHECK (currency = 'NPR')
```

Adding a variant already in the cart is an upsert: `INSERT … ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = LEAST(10, cart_items.quantity + EXCLUDED.quantity)`: an add that would take an existing line above 10 units caps it at 10, and the response says so ([06](06-api-design.md) owns the response shape); a request `quantity` outside 1–10 is still 422 (AC-FR-CART-001-2). The 50-line cap is checked by `addCartItem` after it locks the cart row, which already serialises writers, so no trigger is needed. Over the cap the API answers 422. T-CART-102 (proposed). There is no `shop_id` column: it would be a second copy of the variant's shop that checkout must not trust anyway.

**Indexes.** `cart_items_cart_variant_key` serves cart load (`WHERE cart_id = :c`) and the upsert. There is no `variant_id` index. A cart line points at a variant that had available stock when it was added, so the variant has an inventory movement and is archived, never deleted (§7.9). Deleting a never-stocked variant still runs the RESTRICT check of `cart_items_variant_fkey`, which then scans this table; it is Ephemeral and small, and such deletes are rare, so it is the one foreign key to a deletable parent left without an index (§8).

**Lifecycle and retention.** Deleted by `removeCartItem`, or with the cart.

---

## 11. Orders, fulfillment and returns

The `orders` module owns these tables. The multi-shop model, the "as placed versus effective" amounts and the cumulative allocation rule are in [05 §3](05-order-payment-and-inventory-lifecycles.md#3-the-multi-shop-order-model). The state machines are in [05 §6](05-order-payment-and-inventory-lifecycles.md#6-state-machines). Three rules apply to every table here.

**Human numbers** follow [04 §2.1](04-domain-model-and-data-dictionary.md): `DN-XXXXXXX`, `DN-XXXXXXX-n`, `RT-XXXXXXX`.

**Access.** Customer queries include `customer_user_id = :auth_user` and seller queries `shop_id = :resolved_shop` in the SQL itself ([06 §4.4](06-api-design.md#44-seller-authorization-algorithm), [§4.5](06-api-design.md#45-customer-ownership)). Seller queries on `shop_orders`, and on rows reached through them, also include `acceptance_due_at IS NOT NULL`, because a shop sees a shop order only once it has reached `awaiting_acceptance` ([07 §5.2](07-security-threat-model-and-permissions.md#52-vendor-visibility-of-customer-contact-data) rule 0). A miss returns 404 (T-SEC-001, T-SEC-002).

**Amounts and snapshots are written once.** [05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective) states that order amounts are stored as placed and never rewritten. A trigger makes that a database guarantee instead of a code-review item:

```sql
-- Rejects an UPDATE that changes any column not named in the trigger arguments
CREATE OR REPLACE FUNCTION allow_only_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'on % only % may change', TG_TABLE_NAME, TG_ARGV USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
```

`to_jsonb(row) - text[]` drops the allowed columns and compares the rest. The cost is one row-to-JSON conversion per update, a few microseconds, on rows that change a handful of times in their life. Referential actions fire the trigger too, which is why `orders` lists `idempotency_key_id` (set to null by `ON DELETE SET NULL`, [04 §2.6](04-domain-model-and-data-dictionary.md)). The retention command never disables these triggers: its redaction of `orders` changes only the snapshot columns that `orders_guard` lists (§11.1), no rows of these tables are deleted, and its deletes and the `support_case_messages.body` redaction on the append-only tables pass through the retention exemption of `forbid_mutation()` (proposed, [04 §2.12](04-domain-model-and-data-dictionary.md), [07 §4.10](07-security-threat-model-and-permissions.md#410-database-roles-and-grants)); no `DISABLE TRIGGER` is used. T-ORD-101 (proposed) tries to change every non-allowed column of each guarded table and expects SQLSTATE P0001.

**Schema changes after go-live.** Because a row `UPDATE` of any column outside the list fails, the backfill and value-migration recipes of [04 §20.2.4](04-domain-model-and-data-dictionary.md) need one more step on `orders`, `shop_orders` and `order_items`. A new column with a constant value is added with `ADD COLUMN … DEFAULT <constant>`, which updates no row and fires no trigger. A computed backfill, or a batched value migration on a guarded column, first widens the list in a migration of its own (`CREATE OR REPLACE TRIGGER <table>_guard … allow_only_columns(<current list>, '<col>')`), then backfills by job in short transactions that set only that column, and restores the original list in a migration of the next deploy; T-ORD-101 runs again after that.

### 11.1 `orders`

**Module** `orders` · **Release** R1 · **Shop scope** none (parent of shop-scoped rows; customer-scoped) · **Lifecycle** Record · **Sensitivity** Personal; Sensitive-personal members of `shipping_address` are encrypted; totals are Financial

The checkout the customer sees as "my order DN-4K7Q2M9": who ordered, how they pay, the totals as placed and the delivery address as it was. The parent status is derived from the shop orders ([05 §3.8](05-order-payment-and-inventory-lifecycles.md#38-parent-status-derivation)). This table replaces the current `orders`, which cascades from users and addresses (RF-06), mixes shops (RF-07) and has no idempotency (RF-15).

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                 |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` | Supplied by the action so that step 8 can run before the insert ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step))                                                                                                             |
| `number`                   | text        | no   | App        | `DN-` + 7 Crockford base32 characters                                                                                                                                                                                                                 |
| `customer_user_id`         | uuid        | no   | App        | The signed-in customer                                                                                                                                                                                                                                |
| `status`                   | text        | no   | App        | `awaiting_payment`, `placed`, `in_progress`, `completed`, `cancelled`. Written only by `recomputeOrderStatus`, in the transaction of a shop order change                                                                                              |
| `payment_method`           | text        | no   | App        | `cod`, `esewa`, `khalti`. All three are in the CHECK from the baseline. The API offers only the enabled methods (R1: `cod`)                                                                                                                           |
| `currency`                 | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                                                                       |
| `items_subtotal_minor`     | bigint      | no   | App        | Σ `shop_orders.items_subtotal_minor`                                                                                                                                                                                                                  |
| `shipping_total_minor`     | bigint      | no   | App        | Σ `shop_orders.shipping_fee_minor`                                                                                                                                                                                                                    |
| `discount_total_minor`     | bigint      | no   | `0`        | Σ `shop_orders.discount_minor`; 0 in R1 ([05 §3.4](05-order-payment-and-inventory-lifecycles.md#34-discount-allocation))                                                                                                                              |
| `grand_total_minor`        | bigint      | no   | App        | As placed. The request's `expected_grand_total_minor` is only compared with it (`PRICE_CHANGED`), never stored                                                                                                                                        |
| `shipping_address`         | jsonb       | no   | App        | Snapshot; shape below                                                                                                                                                                                                                                 |
| `shipping_district_code`   | text        | no   | App        | Copy of the snapshot's district for zone reports and filters                                                                                                                                                                                          |
| `customer_email_snapshot`  | text        | yes  | App        | The account email at placement, for receipts and support. Set at placement; null only after anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)) or the end-of-retention redaction ([04 §19.3](04-domain-model-and-data-dictionary.md)) |
| `customer_note`            | text        | yes  | —          | At most 500 characters                                                                                                                                                                                                                                |
| `placed_at`                | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                       |
| `idempotency_key_id`       | uuid        | yes  | —          | The key row of the placing request; null once the key is purged                                                                                                                                                                                       |
| `request_id`               | text        | yes  | —          | `X-Request-Id` of the placing request                                                                                                                                                                                                                 |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                       |

**The `shipping_address` snapshot** (schema version 1):

```json
{
  "schema": 1,
  "source_address_id": "0192f0c4-7d2a-7c61-9a3e-5b1f0e2d4c88",
  "recipient_name_enc": "v1.k2.<iv>.<ciphertext>.<tag>",
  "recipient_phone_enc": "v1.k2.<iv>.<ciphertext>.<tag>",
  "recipient_phone_last4": "4567",
  "province_code": "3",
  "province_name_en": "Bagmati",
  "province_name_ne": "बागमती",
  "district_code": "306",
  "district_name_en": "Kathmandu",
  "district_name_ne": "काठमाडौँ",
  "local_level_code": "30608",
  "local_level_name_en": "Kathmandu Metropolitan City",
  "ward_no": 10,
  "postal_code": "3060810",
  "area_tole_enc": "v1.k2.<iv>.<ciphertext>.<tag>",
  "street_landmark_enc": "v1.k2.<iv>.<ciphertext>.<tag>"
}
```

- **Encrypted members are re-encrypted, not copied.** [04 §2.9](04-domain-model-and-data-dictionary.md) binds every ciphertext to its column through the additional authenticated data. Checkout decrypts each value with AAD `user_addresses.<column>` and encrypts it with AAD `orders.shipping_address.<member>`. A ciphertext copied between tables fails to decrypt, which is the point: rows cannot be moved between contexts without the key.
- **No foreign key to the saved address.** `source_address_id` helps support only. Editing, archiving or deleting the saved address never touches the order. Today deleting an address cascades into its orders [Verified-repo `database/migrations/1780074257570_create_orders_table.ts:13-14`] (RF-06).
- **Names are copied**, so an order still prints the local level's old name after a renaming.
- **Ciphertext only.** `orders_shipping_address_enc_check` applies the format CHECK of §5.1 (INV-25) to the four `*_enc` members. A member that is JSON `null` passes (`->>` returns SQL null for it), because the retention redaction of [04 §19.2](04-domain-model-and-data-dictionary.md) sets the personal members to `null` and keeps the keys, so `orders_shipping_address_check` still holds after redaction. `orders_recipient_present_check` still requires the recipient name and phone while `customer_email_snapshot` is set, so an order cannot be placed without them; anonymisation nulls the email and keeps the snapshot, and the retention redaction nulls both.
- **Vendor visibility** (owned by [07 §5.2](07-security-threat-model-and-permissions.md#52-vendor-visibility-of-customer-contact-data)). A shop sees a shop order only once `acceptance_due_at` is set (rule 0). The recipient fields are decrypted only in `getShopOrder`, for a member with `shop.customer_contact.view`: while the shop order is `awaiting_acceptance` or `accepted`, while any return request on it is open, and for 30 days after it becomes terminal. List rows carry only `recipient_masked` (A-18, [Open OD-17]). The ciphertext stays for the retention period. What account anonymisation does to it is [04 §19.2](04-domain-model-and-data-dictionary.md).
- **Recipient phone hash (R2, proposed).** A keyed `recipient_phone_hash` member, `HMAC-SHA256` of the recipient phone with `BLIND_INDEX_KEY` as for `users.phone_hash` ([04 §2.9](04-domain-model-and-data-dictionary.md)), computed at checkout, lets review-abuse detection match recipient phones against the shop's owner and members ([07 TM-21](07-security-threat-model-and-permissions.md#tm-21-review-abuse-and-fake-reviews-r2)). Schema version 1 has no such member.

**Keys and constraints.**

```sql
CONSTRAINT orders_pkey PRIMARY KEY (id),
CONSTRAINT orders_number_key UNIQUE (number),
CONSTRAINT orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}$'),
CONSTRAINT orders_id_customer_user_id_key UNIQUE (id, customer_user_id),   -- target for §11.7, §14.1
CONSTRAINT orders_customer_fkey FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting_payment', 'placed', 'in_progress', 'completed', 'cancelled')),
CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'esewa', 'khalti')),
CONSTRAINT orders_cod_status_check CHECK (payment_method <> 'cod' OR status <> 'awaiting_payment'),
CONSTRAINT orders_currency_check CHECK (currency = 'NPR'),
CONSTRAINT orders_amounts_check CHECK (items_subtotal_minor >= 0 AND shipping_total_minor >= 0
  AND discount_total_minor >= 0 AND discount_total_minor <= items_subtotal_minor),
CONSTRAINT orders_totals_check
  CHECK (grand_total_minor = items_subtotal_minor + shipping_total_minor - discount_total_minor),
CONSTRAINT orders_shipping_address_check CHECK (
  jsonb_typeof(shipping_address) = 'object'
  AND shipping_address ?& ARRAY['recipient_name_enc', 'recipient_phone_enc',
                                'district_code', 'local_level_code', 'ward_no']
  AND shipping_address ->> 'district_code' = shipping_district_code),
CONSTRAINT orders_shipping_address_enc_check CHECK (
      ((shipping_address ->> 'recipient_name_enc') IS NULL OR (shipping_address ->> 'recipient_name_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
  AND ((shipping_address ->> 'recipient_phone_enc') IS NULL OR (shipping_address ->> 'recipient_phone_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
  AND ((shipping_address ->> 'area_tole_enc') IS NULL OR (shipping_address ->> 'area_tole_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')
  AND ((shipping_address ->> 'street_landmark_enc') IS NULL OR (shipping_address ->> 'street_landmark_enc') ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$')),
CONSTRAINT orders_recipient_present_check CHECK (customer_email_snapshot IS NULL
  OR ((shipping_address ->> 'recipient_name_enc') IS NOT NULL
      AND (shipping_address ->> 'recipient_phone_enc') IS NOT NULL)),
CONSTRAINT orders_shipping_district_fkey FOREIGN KEY (shipping_district_code)
  REFERENCES districts (code) ON DELETE RESTRICT,
CONSTRAINT orders_customer_note_check CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
CONSTRAINT orders_request_id_check CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9-]{8,64}$'),
CONSTRAINT orders_idempotency_key_fkey FOREIGN KEY (idempotency_key_id)
  REFERENCES idempotency_keys (id) ON DELETE SET NULL

CREATE TRIGGER orders_guard BEFORE UPDATE ON orders FOR EACH ROW
  EXECUTE FUNCTION allow_only_columns('status', 'updated_at', 'idempotency_key_id',
    'shipping_address', 'customer_email_snapshot', 'customer_note');   -- the last three for 04 §19.2 and key rotation (04 §2.9)
```

`orders_idempotency_key_key` is a partial unique index: at most one order per `idempotency_keys` row (INV-22 of [04 §16.2](04-domain-model-and-data-dictionary.md)). `idempotency_keys_scope_key` already makes a duplicate request wait and replay (§15.2), so the index is a backstop against a code path that inserts a second order under the same key row. Rows whose key was purged hold null and are outside the index. T-CHK-004 covers the normal path.

`orders_totals_check` is the grand-total arithmetic invariant. The cross-row sums (parent equals the sum of its shop orders) cannot be CHECKs. They are asserted by the checkout action before commit and by the nightly integrity job ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)); their test is T-ORD-102 ([04 §16.4](04-domain-model-and-data-dictionary.md)). `orders_cod_status_check` backs [05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step): a COD order is placed as `placed` and never waits for a payment. T-ORD-108 (proposed) inserts rows that break each CHECK of `orders`, `shop_orders` and `order_items` and expects 23514.

**Indexes.**

| Index                            | Definition                                                                                | Query served                                                                                                                                   |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `orders_number_key`              | `(number)`                                                                                | Order by number: `getMyOrder` (with `customer_user_id = :u`), `adminGetOrder`, support phone lookups                                           |
| `orders_customer_list_idx`       | `(customer_user_id, placed_at DESC, id DESC)`                                             | `listMyOrders`: `WHERE customer_user_id = :u ORDER BY placed_at DESC, id DESC` (cursor)                                                        |
| `orders_admin_status_idx`        | `(status, placed_at DESC, id DESC)`                                                       | `adminListOrders` filtered by status                                                                                                           |
| `orders_admin_recent_idx`        | `(placed_at DESC, id DESC)`                                                               | `adminListOrders` unfiltered; "orders placed today" between two Kathmandu midnights ([04 §2.2](04-domain-model-and-data-dictionary.md))        |
| `orders_cod_open_idx`            | `(customer_user_id) WHERE payment_method = 'cod' AND status IN ('placed', 'in_progress')` | COD limit at checkout step 7: `count(*) … WHERE customer_user_id = :u AND payment_method = 'cod' AND status IN ('placed','in_progress')`       |
| `orders_idempotency_key_key`     | UNIQUE `(idempotency_key_id) WHERE idempotency_key_id IS NOT NULL`                        | One order per idempotency key row (INV-22), and the `SET NULL` action run by the hourly key purge. Without it, every purged key scans `orders` |
| `orders_id_customer_user_id_key` | `(id, customer_user_id)`                                                                  | Foreign-key target only                                                                                                                        |

**Lifecycle and retention.** Inserted once by `placeOrder`. Afterwards only `status` changes (and, under [04 §19.2](04-domain-model-and-data-dictionary.md), the personal snapshot fields, whose `*_enc` members key rotation also re-encrypts, [04 §2.9](04-domain-model-and-data-dictionary.md)). Never deleted inside the retention period: 7 years after the order's last shop order became terminal, which approximates "six years after the end of the fiscal year" without a Bikram Sambat calendar (VAT Rules 2053 r23(7) requires 6 years; E-Commerce Directive 2082 s14 at least 5 [Verify-external VX-08]; [04 §19.3](04-domain-model-and-data-dictionary.md)).

### 11.2 `shop_orders`

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial, Internal

What a vendor accepts, ships and is settled for: one row per shop per order. Its status machine is [05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder).

| Column                                                       | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------ | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                         | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                                                                   |
| `order_id`                                                   | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                                                                   |
| `shop_id`                                                    | uuid        | no   | App        | From the cart line's variant, never from input                                                                                                                                                                                                                                                                                                                                                    |
| `number`                                                     | text        | no   | App        | Parent number + `-` + position ([04 §2.1](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                                                                                |
| `status`                                                     | text        | no   | App        | `awaiting_payment`, `awaiting_acceptance`, `accepted`, `completed`, `cancelled`, `rejected`                                                                                                                                                                                                                                                                                                       |
| `cancel_reason`                                              | text        | yes  | —          | `customer_cancelled`, `payment_expired`, `acceptance_timeout`, `admin_cancelled`, `shop_frozen`, `undeliverable`, `stock_unavailable_after_payment`. The customer's own reason (AC-FR-ORD-002-2) goes into the `order_events` row (§11.4), the admin note into the audit row's `reason`                                                                                                           |
| `rejection_reason`                                           | text        | yes  | —          | Whole rejection: `out_of_stock`, `cannot_fulfil`, `pricing_error`, `other` ([05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder)). Item-level reasons go into the `order_events` row                                                                                                                                                                                              |
| `currency`                                                   | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                                                                                                                                                                                                                   |
| `items_subtotal_minor`                                       | bigint      | no   | App        | Σ `order_items.line_subtotal_minor`                                                                                                                                                                                                                                                                                                                                                               |
| `shipping_fee_minor`                                         | bigint      | no   | App        | The shop's zone rate at checkout, fixed from then on ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order))                                                                                                                                                                                                                                                     |
| `discount_minor`                                             | bigint      | no   | `0`        | Σ `order_items.discount_minor`                                                                                                                                                                                                                                                                                                                                                                    |
| `total_minor`                                                | bigint      | no   | App        | As placed                                                                                                                                                                                                                                                                                                                                                                                         |
| `commission_total_minor`                                     | bigint      | no   | App        | Σ `order_items.commission_minor`                                                                                                                                                                                                                                                                                                                                                                  |
| `delivery_zone_code_snapshot`                                | text        | no   | App        | Zone that priced the fee                                                                                                                                                                                                                                                                                                                                                                          |
| `est_min_days_snapshot`, `est_max_days_snapshot`             | smallint    | no   | App        | The delivery promise shown at checkout. E-Commerce Act s9(1) requires delivery within the stated period [Verify-external VX-02], so the promise is kept as evidence                                                                                                                                                                                                                               |
| `shop_name_snapshot`                                         | text        | no   | App        | Shop name at placement, for receipts                                                                                                                                                                                                                                                                                                                                                              |
| `acceptance_due_at`                                          | timestamptz | yes  | —          | `now() + vendor_acceptance_sla_hours` on entering `awaiting_acceptance` (at COD placement or at gateway capture). Set exactly once and never cleared: [07 §5.2](07-security-threat-model-and-permissions.md#52-vendor-visibility-of-customer-contact-data) rule 0 uses `acceptance_due_at IS NOT NULL` as the seller-visibility test (T-SEC-001), and `shop_orders_acceptance_due_check` backs it |
| `accepted_at`, `completed_at`, `cancelled_at`, `rejected_at` | timestamptz | yes  | —          | Set by the transition that reaches the state                                                                                                                                                                                                                                                                                                                                                      |
| `version`                                                    | int         | no   | `1`        | [04 §2.10](04-domain-model-and-data-dictionary.md)                                                                                                                                                                                                                                                                                                                                                |
| `created_at`, `updated_at`                                   | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                                                                   |

**Keys and constraints.**

```sql
CONSTRAINT shop_orders_pkey PRIMARY KEY (id),
CONSTRAINT shop_orders_number_key UNIQUE (number),
CONSTRAINT shop_orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}-[1-9][0-9]?$'),
CONSTRAINT shop_orders_id_shop_id_key UNIQUE (id, shop_id),        -- target for §11.3, §11.5, §11.7, §12.4, §13.1, §13.5
CONSTRAINT shop_orders_id_order_id_key UNIQUE (id, order_id),      -- target for §11.3, §11.4, §12.1, §12.2
CONSTRAINT shop_orders_order_shop_key UNIQUE (order_id, shop_id),  -- one shop order per shop per order
CONSTRAINT shop_orders_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
CONSTRAINT shop_orders_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT shop_orders_status_check CHECK (status IN ('awaiting_payment', 'awaiting_acceptance',
  'accepted', 'completed', 'cancelled', 'rejected')),
CONSTRAINT shop_orders_cancel_reason_check CHECK (cancel_reason IN ('customer_cancelled', 'payment_expired',
  'acceptance_timeout', 'admin_cancelled', 'shop_frozen', 'undeliverable', 'stock_unavailable_after_payment')),
CONSTRAINT shop_orders_rejection_reason_check
  CHECK (rejection_reason IN ('out_of_stock', 'cannot_fulfil', 'pricing_error', 'other')),
CONSTRAINT shop_orders_cancelled_check CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL)
  AND (cancel_reason IS NULL) = (cancelled_at IS NULL)),
CONSTRAINT shop_orders_rejected_check CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL)
  AND (rejection_reason IS NULL) = (rejected_at IS NULL)),
CONSTRAINT shop_orders_accepted_check CHECK (status NOT IN ('accepted', 'completed') OR accepted_at IS NOT NULL),
CONSTRAINT shop_orders_completed_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
CONSTRAINT shop_orders_acceptance_due_check CHECK (CASE
  WHEN status = 'awaiting_payment' THEN acceptance_due_at IS NULL
  WHEN status = 'cancelled' THEN CASE
    WHEN cancel_reason IN ('payment_expired', 'stock_unavailable_after_payment') THEN acceptance_due_at IS NULL
    WHEN cancel_reason IN ('acceptance_timeout', 'admin_cancelled', 'undeliverable') THEN acceptance_due_at IS NOT NULL
    ELSE true END              -- customer_cancelled, shop_frozen: reached before or after awaiting_acceptance
  ELSE acceptance_due_at IS NOT NULL END),
CONSTRAINT shop_orders_currency_check CHECK (currency = 'NPR'),
CONSTRAINT shop_orders_amounts_check CHECK (items_subtotal_minor >= 0 AND shipping_fee_minor >= 0
  AND discount_minor >= 0 AND discount_minor <= items_subtotal_minor
  AND commission_total_minor >= 0 AND commission_total_minor <= items_subtotal_minor),
CONSTRAINT shop_orders_totals_check
  CHECK (total_minor = items_subtotal_minor + shipping_fee_minor - discount_minor),
CONSTRAINT shop_orders_estimate_check
  CHECK (est_min_days_snapshot >= 0 AND est_max_days_snapshot >= est_min_days_snapshot)

CREATE TRIGGER shop_orders_guard BEFORE UPDATE ON shop_orders FOR EACH ROW
  EXECUTE FUNCTION allow_only_columns('status', 'cancel_reason', 'rejection_reason', 'acceptance_due_at',
    'accepted_at', 'completed_at', 'cancelled_at', 'rejected_at', 'version', 'updated_at');
```

`shop_orders_order_shop_key` makes the split exact: a bug that creates two shop orders for the same shop in one order fails with 23505. T-ORD-107 (proposed). That the number starts with the parent's number is checked by the action, because a CHECK cannot read the parent row.

The state CHECKs keep each reason and its timestamp together and only on the state they belong to. `shop_orders_acceptance_due_check` follows the transitions of [05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder): `acceptance_due_at` is null while `awaiting_payment` and after a cancellation that only a shop order still in `awaiting_payment` can take (`payment_expired`, and `stock_unavailable_after_payment` on a late capture), and set on every state and cancellation that can only follow `awaiting_acceptance`; `customer_cancelled` and `shop_frozen` occur on both sides, so the CHECK leaves them to the transition code. A faulty write therefore cannot hide a live shop order from its shop, or show it one that never reached `awaiting_acceptance`. T-ORD-108 (proposed, §11.1) covers these CHECKs.

**Indexes.**

| Index                                                       | Definition                                                                        | Query served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_orders_order_shop_key`                                | `(order_id, shop_id)`                                                             | Shop orders of an order: customer order page, parent recompute, locking in `id` order ([05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering))                                                                                                                                                                                                                                                                                                                                   |
| `shop_orders_number_key`                                    | `(number)`                                                                        | `getShopOrder`: `WHERE number = :n AND shop_id = :resolved_shop AND acceptance_due_at IS NOT NULL`; a shop order that never reached `awaiting_acceptance` answers 404 ([07 §5.2](07-security-threat-model-and-permissions.md#52-vendor-visibility-of-customer-contact-data) rule 0)                                                                                                                                                                                                                       |
| `shop_orders_seller_list_idx`                               | `(shop_id, status, created_at DESC, id DESC) WHERE acceptance_due_at IS NOT NULL` | Seller order list by tab and the seller counts (`newOrderCount`): `WHERE shop_id = ? AND status = ? AND acceptance_due_at IS NOT NULL ORDER BY created_at DESC, id DESC`. The new-orders tab sorted by deadline (`WHERE shop_id = ? AND status = 'awaiting_acceptance' AND acceptance_due_at IS NOT NULL ORDER BY acceptance_due_at, id`, cursor `(acceptance_due_at, id)`) reads the same `(shop_id, status)` prefix and sorts in memory: a shop has at most a few dozen shop orders awaiting acceptance |
| `shop_orders_seller_all_idx`                                | `(shop_id, created_at DESC, id DESC)`                                             | Seller order list, "All" tab: `WHERE shop_id = ? AND acceptance_due_at IS NOT NULL ORDER BY created_at DESC, id DESC`, the predicate applied as a filter; admin view of one shop's orders, which also shows shop orders still `awaiting_payment` and so reads the index without the predicate                                                                                                                                                                                                             |
| `shop_orders_acceptance_due_idx`                            | `(acceptance_due_at) WHERE status = 'awaiting_acceptance'`                        | Acceptance-timeout sweeper: `WHERE status = 'awaiting_acceptance' AND acceptance_due_at <= now()`                                                                                                                                                                                                                                                                                                                                                                                                         |
| `shop_orders_accepted_idx`                                  | `(id) WHERE status = 'accepted'`                                                  | Auto-complete sweep: accepted shop orders joined by `shipments_shop_order_key` to delivered shipments with `return_window_ends_at <= now()` (§11.5). The partial index holds only open orders                                                                                                                                                                                                                                                                                                             |
| `shop_orders_id_shop_id_key`, `shop_orders_id_order_id_key` |                                                                                   | Foreign-key targets only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

**Lifecycle and retention.** Inserted by checkout. Status and its timestamps change by compare-and-set; amounts never change. Retained as §11.1.

### 11.3 `order_items`

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id`, composite FKs · **Lifecycle** Record · **Sensitivity** Financial, Internal

One line per variant per shop order, with everything needed to understand the sale after the catalog changes ([04 §2.13](04-domain-model-and-data-dictionary.md)): the product as it was, the price, discount, tax and the commission snapshot.

| Column                                                         | Type        | Null | Default    | Notes                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                           | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                       |
| `order_id`, `shop_order_id`, `shop_id`                         | uuid        | no   | App        | Tenant and parent keys ([04 §2.5](04-domain-model-and-data-dictionary.md))                                                                                                                                            |
| `product_id`, `variant_id`                                     | uuid        | no   | App        | For navigation and reports; RESTRICT                                                                                                                                                                                  |
| `product_title_snapshot`                                       | text        | no   | App        | Title at placement                                                                                                                                                                                                    |
| `variant_label_snapshot`                                       | text        | no   | App        | `"Size: M / Color: Black"`; empty string for a default variant                                                                                                                                                        |
| `sku_snapshot`                                                 | text        | no   | App        |                                                                                                                                                                                                                       |
| `brand_name_snapshot`                                          | text        | yes  | —          | Brand at placement; null for own label. Kept because counterfeit disputes (OD-21) turn on what brand was sold                                                                                                         |
| `image_url_snapshot`                                           | text        | yes  | —          | HTTPS URL of the derived WebP at placement. Keys are content-addressed and never overwritten ([03 §3.5](03-system-architecture.md#35-object-storage-layout)); media cleanup must keep objects referenced here (§7.13) |
| `category_path_snapshot`                                       | text        | no   | App        | `"Clothing > Tops > T-Shirts"`                                                                                                                                                                                        |
| `currency`                                                     | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                                       |
| `unit_price_minor`                                             | bigint      | no   | App        | Selling price (tax-inclusive) read from the variant in the checkout transaction                                                                                                                                       |
| `compare_at_price_minor_snapshot`                              | bigint      | yes  | —          | Reference price shown at the time (FR-PROMO-001); display only, never used in totals                                                                                                                                  |
| `quantity`                                                     | int         | no   | App        | As placed                                                                                                                                                                                                             |
| `rejected_quantity`, `cancelled_quantity`, `returned_quantity` | int         | no   | `0`        | Units removed later, consumed in that order by the cumulative rule ([05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective))                                                    |
| `line_subtotal_minor`                                          | bigint      | no   | App        | `unit_price_minor × quantity`                                                                                                                                                                                         |
| `discount_minor`                                               | bigint      | no   | `0`        | Allocated discount; 0 in R1, largest remainder in R2 ([04 §18](04-domain-model-and-data-dictionary.md))                                                                                                               |
| `tax_minor`                                                    | bigint      | no   | `0`        | 0 in R1: DripNepal computes no VAT, prices are tax-inclusive [Assumption A-16, OD-11, OD-26]                                                                                                                          |
| `tax_rate_bp`                                                  | int         | yes  | —          | Null in R1                                                                                                                                                                                                            |
| `tax_inclusive`                                                | boolean     | no   | `true`     | [Verify-external VX-05]                                                                                                                                                                                               |
| `line_total_minor`                                             | bigint      | no   | App        | What the customer pays for the line                                                                                                                                                                                   |
| `commission_rate_bp`                                           | int         | no   | App        | Shop override, else platform default, read in the checkout transaction                                                                                                                                                |
| `commission_minor`                                             | bigint      | no   | App        | `roundHalfUp(base × rate / 10000)`; base per A-04 and [05 §3.5](05-order-payment-and-inventory-lifecycles.md#35-commission-allocation-per-item)                                                                       |
| `created_at`, `updated_at`                                     | timestamptz | no   | `now()`    |                                                                                                                                                                                                                       |

**Keys and constraints.** The four foreign keys are those of the worked example in [04 §2.5](04-domain-model-and-data-dictionary.md).

```sql
CONSTRAINT order_items_pkey PRIMARY KEY (id),
CONSTRAINT order_items_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT order_items_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT order_items_variant_fkey FOREIGN KEY (variant_id, shop_id)
  REFERENCES product_variants (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT order_items_variant_product_fkey FOREIGN KEY (variant_id, product_id)
  REFERENCES product_variants (id, product_id) ON DELETE RESTRICT,
CONSTRAINT order_items_shop_order_variant_key UNIQUE (shop_order_id, variant_id),  -- one line per variant
CONSTRAINT order_items_id_shop_id_key UNIQUE (id, shop_id),                        -- target for §13.1
CONSTRAINT order_items_id_shop_order_id_key UNIQUE (id, shop_order_id),            -- target for §11.8, §12.5
CONSTRAINT order_items_reservation_ref_key UNIQUE (id, order_id, shop_id, variant_id),  -- target for §8.2
CONSTRAINT order_items_currency_check CHECK (currency = 'NPR'),
CONSTRAINT order_items_quantity_check CHECK (quantity > 0),
CONSTRAINT order_items_removed_check CHECK (rejected_quantity >= 0 AND cancelled_quantity >= 0
  AND returned_quantity >= 0
  AND rejected_quantity + cancelled_quantity + returned_quantity <= quantity),
CONSTRAINT order_items_prices_check CHECK (unit_price_minor >= 0
  AND (compare_at_price_minor_snapshot IS NULL OR compare_at_price_minor_snapshot > unit_price_minor)),
CONSTRAINT order_items_subtotal_check CHECK (line_subtotal_minor = unit_price_minor * quantity),
CONSTRAINT order_items_discount_check CHECK (discount_minor >= 0 AND discount_minor <= line_subtotal_minor),
CONSTRAINT order_items_tax_check CHECK (tax_minor >= 0
  AND (tax_rate_bp IS NULL OR tax_rate_bp BETWEEN 0 AND 10000)
  AND (NOT tax_inclusive OR tax_minor <= line_total_minor)),
CONSTRAINT order_items_total_check CHECK (line_total_minor = line_subtotal_minor - discount_minor
  + CASE WHEN tax_inclusive THEN 0 ELSE tax_minor END),
CONSTRAINT order_items_commission_check CHECK (commission_rate_bp BETWEEN 0 AND 10000
  AND commission_minor >= 0 AND commission_minor <= line_subtotal_minor),
CONSTRAINT order_items_snapshot_check CHECK (char_length(product_title_snapshot) BETWEEN 1 AND 150
  AND char_length(variant_label_snapshot) <= 200 AND char_length(sku_snapshot) BETWEEN 1 AND 64
  AND (image_url_snapshot IS NULL OR image_url_snapshot ~ '^https://'))

CREATE TRIGGER order_items_guard BEFORE UPDATE ON order_items FOR EACH ROW
  EXECUTE FUNCTION allow_only_columns('rejected_quantity', 'cancelled_quantity', 'returned_quantity', 'updated_at');

CREATE OR REPLACE FUNCTION order_items_counters_only_grow() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rejected_quantity < OLD.rejected_quantity OR NEW.cancelled_quantity < OLD.cancelled_quantity
     OR NEW.returned_quantity < OLD.returned_quantity THEN
    RAISE EXCEPTION 'order_items removal counters can only grow' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER order_items_counters BEFORE UPDATE ON order_items FOR EACH ROW
  EXECUTE FUNCTION order_items_counters_only_grow();
```

The commission formula is not a CHECK. Its base depends on who funds an R2 discount ([05 §3.4](05-order-payment-and-inventory-lifecycles.md#34-discount-allocation)), which the row does not record. The pricing function computes it, and T-ORD-008 (proposed) checks the cumulative allocation and the rounding. A crafted line that points at another shop's variant fails with 23503 (T-ORD-104, proposed; [04 §2.5](04-domain-model-and-data-dictionary.md)).

**Indexes.**

| Index                                                                                               | Definition                    | Query served                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_items_shop_order_variant_key`                                                                | `(shop_order_id, variant_id)` | Lines of a shop order: seller and customer order detail, fulfilment, refund and return forms                                                                                                          |
| `order_items_variant_idx`                                                                           | `(variant_id)`                | `replaceProductVariants` deciding between hard delete and archive: `EXISTS (SELECT 1 FROM order_items WHERE variant_id = :v)`; also the RESTRICT check when a never-stocked variant is deleted (§7.9) |
| `order_items_id_shop_id_key`, `order_items_id_shop_order_id_key`, `order_items_reservation_ref_key` |                               | Foreign-key targets only                                                                                                                                                                              |

**Lifecycle and retention.** Inserted by checkout. Only the three removal counters change, and only upwards. Retained as §11.1.

### 11.4 `order_events`

**Module** `orders` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal, Internal

The timeline of an order: what happened, who did it and who may see it. Admin notes (`addOrderNote`) are internal events. The `audit_logs` row of the same action (§15.3) is the accountability record. This table is the display record.

| Column          | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                         |
| --------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                               |
| `order_id`      | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                               |
| `shop_order_id` | uuid        | yes  | —          | Null for order-level events                                                                                                                                                                                                                                                                                                                                   |
| `type`          | text        | no   | App        | `<subject>.<event>`: `order.placed`, `shop_order.accepted`, `shop_order.items_rejected`, `shipment.shipped`, `payment.cod_collected`, `order.note`, `order.status_changed`                                                                                                                                                                                    |
| `visibility`    | text        | no   | App        | `customer`, `shop`, `internal`                                                                                                                                                                                                                                                                                                                                |
| `data`          | jsonb       | no   | `'{}'`     | Small typed object, for example `{"from":"awaiting_acceptance","to":"accepted"}`; the members per `type` are below. Never contact data: the free-text members (the `order.note` text of `addOrderNote` and the vendor's rejection `note`) are kept for the record's life under the no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md) |
| `actor_type`    | text        | no   | App        | `customer`, `shop_member`, `platform_staff`, `system`, `provider`                                                                                                                                                                                                                                                                                             |
| `actor_user_id` | uuid        | yes  | —          |                                                                                                                                                                                                                                                                                                                                                               |
| `created_at`    | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                               |

Who sees what: the customer sees `customer` events. A shop member sees `customer` and `shop` events of their own shop orders. Staff see everything. `internal` never leaves the admin surface ([07](07-security-threat-model-and-permissions.md)).

**Typed `data` members.** Each `type` has one documented shape, a TypeScript type plus a Vine schema in the `orders` module ([04 §2.11](04-domain-model-and-data-dictionary.md)). Status events carry `from` and `to`. The details that [05 §6](05-order-payment-and-inventory-lifecycles.md#6-state-machines) and [06](06-api-design.md) record only as a timeline event are:

- `shop_order.cancelled`: `{from, to, cancel_reason, customer_reason?}`. `customer_reason` is the customer's choice on `cancelMyShopOrder` (AC-FR-ORD-002-2), one of `changed_mind`, `ordered_by_mistake`, `found_cheaper`, `delivery_too_slow`, `other`, and is present only with `cancel_reason = 'customer_cancelled'`.
- `shop_order.rejected` and `shop_order.items_rejected`: `{reason, note?}`. `reason` is from the `rejection_reason` list (§11.2); `note` is the vendor's optional remark on `rejectShopOrder`, at most 500 characters [Assumption].
- `return_request.in_transit`: `{courier_name?, tracking_number?}` from `markReturnInTransit` (proposed), with the length rules of `shipments` (§11.5).

Staff notes are not copied here: the `adminCancelShopOrder` note and the `override_reason` of a return created after its window go to the `reason` of the action's `audit_logs` row (§15.3), as [05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder) states for the cancellation.

**Keys and constraints.**

```sql
CONSTRAINT order_events_pkey PRIMARY KEY (id),
CONSTRAINT order_events_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
CONSTRAINT order_events_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,           -- MATCH SIMPLE: null allowed
CONSTRAINT order_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT order_events_type_check CHECK (type ~ '^[a-z_]+\.[a-z_]+$'),
CONSTRAINT order_events_visibility_check CHECK (visibility IN ('customer', 'shop', 'internal')),
CONSTRAINT order_events_shop_visibility_check CHECK (visibility <> 'shop' OR shop_order_id IS NOT NULL),
CONSTRAINT order_events_actor_type_check
  CHECK (actor_type IN ('customer', 'shop_member', 'platform_staff', 'system', 'provider')),
CONSTRAINT order_events_actor_check
  CHECK ((actor_type IN ('customer', 'shop_member', 'platform_staff')) = (actor_user_id IS NOT NULL)),
CONSTRAINT order_events_data_check CHECK (jsonb_typeof(data) = 'object')
```

**Indexes.**

| Index                         | Definition                                                        | Query served                                                                                             |
| ----------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `order_events_order_idx`      | `(order_id, created_at, id)`                                      | Customer and admin timeline: `WHERE order_id = :o [AND visibility = 'customer'] ORDER BY created_at, id` |
| `order_events_shop_order_idx` | `(shop_order_id, created_at, id) WHERE shop_order_id IS NOT NULL` | Seller timeline: `WHERE shop_order_id = :so AND visibility IN ('customer','shop')`                       |

**Lifecycle and retention.** Insert-only. Retained as §11.1. Nothing in it is redacted at the end of the period (append-only, [04 §2.12](04-domain-model-and-data-dictionary.md)); its free text follows the no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md).

### 11.5 `shipments`

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Entity · **Sensitivity** Internal (tracking data is shown to the customer)

The parcel of a shop order. R1 has exactly one shipment per shop order and no courier API: every transition is a vendor entry through `recordFulfillmentEvent` [Confirmed Q5]. The machine is [05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment).

| Column                       | Type        | Null | Default     | Notes                                                                                                                                                                       |
| ---------------------------- | ----------- | ---- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | uuid        | no   | `uuidv7()`  |                                                                                                                                                                             |
| `shop_order_id`              | uuid        | no   | App         | Unique in R1                                                                                                                                                                |
| `shop_id`                    | uuid        | no   | App         |                                                                                                                                                                             |
| `status`                     | text        | no   | `'pending'` | `pending`, `packed`, `shipped`, `delivered`, `delivery_failed`, `returning`, `returned_to_origin`                                                                           |
| `courier_name`               | text        | yes  | —           | Free text in R1 (for example "Nepal Can Move", own rider). R3 courier APIs add a `courier_code`                                                                             |
| `tracking_number`            | text        | yes  | —           | Optional in R1, whatever the courier ([05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment))                                                      |
| `tracking_url`               | text        | yes  | —           | HTTPS only, so a vendor cannot plant a `javascript:` link on the customer's order page                                                                                      |
| `shipped_at`, `delivered_at` | timestamptz | yes  | —           | `delivered_at` starts the return window and the ledger hold                                                                                                                 |
| `return_window_ends_at`      | timestamptz | yes  | —           | `delivered_at + return_window_days`, computed and stored in the `delivered` transaction ([05 §9.6](05-order-payment-and-inventory-lifecycles.md)). Never changed afterwards |
| `attempt_count`              | smallint    | no   | `0`         | 1 at first shipment, +1 per reattempt                                                                                                                                       |
| `version`                    | int         | no   | `1`         |                                                                                                                                                                             |
| `created_at`, `updated_at`   | timestamptz | no   | `now()`     |                                                                                                                                                                             |

**Keys and constraints.**

```sql
CONSTRAINT shipments_pkey PRIMARY KEY (id),
CONSTRAINT shipments_shop_order_key UNIQUE (shop_order_id),     -- R1: one parcel per shop order
CONSTRAINT shipments_id_shop_id_key UNIQUE (id, shop_id),       -- target for §11.6
CONSTRAINT shipments_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT shipments_status_check CHECK (status IN ('pending', 'packed', 'shipped', 'delivered',
  'delivery_failed', 'returning', 'returned_to_origin')),
CONSTRAINT shipments_shipped_check CHECK (status IN ('pending', 'packed')
  OR (shipped_at IS NOT NULL AND courier_name IS NOT NULL AND attempt_count >= 1)),
CONSTRAINT shipments_delivered_check CHECK ((status = 'delivered') = (delivered_at IS NOT NULL)
  AND (delivered_at IS NULL OR delivered_at >= shipped_at)),
CONSTRAINT shipments_return_window_check CHECK ((delivered_at IS NULL) = (return_window_ends_at IS NULL)
  AND (return_window_ends_at IS NULL OR return_window_ends_at >= delivered_at + interval '7 days')),
CONSTRAINT shipments_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3),  -- reattempt limit [Assumption, 05 §6.3]
CONSTRAINT shipments_courier_name_check
  CHECK (courier_name IS NULL OR char_length(courier_name) BETWEEN 2 AND 80),
CONSTRAINT shipments_tracking_number_check
  CHECK (tracking_number IS NULL OR char_length(tracking_number) BETWEEN 3 AND 64),
CONSTRAINT shipments_tracking_url_check
  CHECK (tracking_url IS NULL OR (tracking_url ~ '^https://' AND char_length(tracking_url) <= 500))
```

T-FUL-101 (proposed) sets each shipped status without the required fields and expects 23514.

**Return window snapshot.** `return_window_ends_at` copies the `return_window_days` setting (§15.1) at delivery, as [05 §9.6](05-order-payment-and-inventory-lifecycles.md) requires for every deadline: a later settings change never moves a window a customer was already given. Auto-complete ([05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder)) and return creation (§11.7) read this column, not the live setting. `shipments_return_window_check` keeps the column in step with `delivered_at` and never shorter than the legal minimum of 7 days (CPA 2075 s14 [Verify-external VX-04]). The tracking-correction transition `shipped → shipped` ([05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment)) changes only `courier_name`, `tracking_number` and `tracking_url`.

**Indexes.**

| Index                      | Definition                                                        | Query served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shipments_shop_order_key` | `(shop_order_id)`                                                 | Shipment of a shop order (every fulfilment action, order pages)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `shipments_to_ship_idx`    | `(shop_id, created_at, id) WHERE status IN ('pending', 'packed')` | Seller "ready to ship" list: `SELECT s.* FROM shipments s JOIN shop_orders so ON so.id = s.shop_order_id AND so.shop_id = s.shop_id WHERE s.shop_id = :resolved_shop AND s.status IN ('pending','packed') AND so.status = 'accepted' ORDER BY s.created_at, s.id`. A shop order cancelled or rejected after acceptance leaves its shipment in `pending` or `packed` for good ([05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment)), so those few rows stay in the index and the join on `so.status = 'accepted'` is required (T-FUL-001, proposed, checks that the shipment of a shop order cancelled by `adminCancelShopOrder` after acceptance is not listed)                                                                                                                                                                                                                                                                                                                                                           |
| `shipments_in_transit_idx` | `(updated_at) WHERE status IN ('shipped', 'delivery_failed')`     | Admin follow-up lists of [05 §8.9](05-order-payment-and-inventory-lifecycles.md#89-cod-refusal-and-collection-reconciliation), read when the queue is opened: "no outcome" (`WHERE status IN ('shipped','delivery_failed') AND updated_at < now() - interval '10 days'`; every shipment event updates the row), and COD collected while the shipment is still `shipped` (the same rows joined through `payments_cod_shop_order_key` to a `collected` COD payment with `captured_at < now() - interval '3 days'`, also [05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks) check 1). The other "COD outcome missing" list, delivered but still `awaiting_collection` after 3 days, starts from `payments_cod_uncollected_idx` (§12.1) and joins `shipments_shop_order_key` with `status = 'delivered' AND delivered_at < now() - interval '3 days'`. The reminders themselves are delayed `orders.cod_outcome_reminder` jobs and need no index; auto-complete is driven by `shop_orders_accepted_idx` (§11.2) |

**Lifecycle and retention.** Created in the accept transaction. Updated by fulfilment events. Never deleted. Retained as §11.1. R2 partial shipments (FR-FUL-005) drop `shipments_shop_order_key` and add a `shipment_items` table.

### 11.6 `shipment_events`

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id`, composite FK · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal; `note` Personal (no-contact-data rule, [04 §19.1](04-domain-model-and-data-dictionary.md))

One row per fulfilment event recorded by the vendor (or by staff for a frozen shop).

| Column                   | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------ | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                     | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                              |
| `shipment_id`, `shop_id` | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                              |
| `event`                  | text        | no   | App        | `packed`, `shipped`, `delivered`, `delivery_failed`, `reattempt`, `returning`, `returned_to_origin` (the `recordFulfillmentEvent` values)                                                                                                                                                                                                                    |
| `status`                 | text        | no   | App        | Shipment status after the event                                                                                                                                                                                                                                                                                                                              |
| `reason_code`            | text        | yes  | —          | Only for `delivery_failed`: `customer_unreachable`, `refused`, `address_problem`, `other`                                                                                                                                                                                                                                                                    |
| `note`                   | text        | yes  | —          | At most 500 characters. On a `returned_to_origin` row it holds the reason for the units not restocked, required when any unit is not restocked ([05 §5.8](05-order-payment-and-inventory-lifecycles.md#58-rto-restock)). Never contact data: kept for the record's life under the no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md) |
| `actor_type`             | text        | no   | App        | `shop_member`, `platform_staff`, `system`                                                                                                                                                                                                                                                                                                                    |
| `actor_user_id`          | uuid        | yes  | —          |                                                                                                                                                                                                                                                                                                                                                              |
| `created_at`             | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                              |

**Keys and constraints.**

```sql
CONSTRAINT shipment_events_pkey PRIMARY KEY (id),
CONSTRAINT shipment_events_shipment_fkey FOREIGN KEY (shipment_id, shop_id)
  REFERENCES shipments (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT shipment_events_actor_fkey FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT shipment_events_event_check CHECK (event IN ('packed', 'shipped', 'delivered',
  'delivery_failed', 'reattempt', 'returning', 'returned_to_origin')),
CONSTRAINT shipment_events_status_check
  CHECK ((event = 'reattempt' AND status = 'shipped') OR (event <> 'reattempt' AND status = event)),
CONSTRAINT shipment_events_reason_check CHECK ((event = 'delivery_failed') = (reason_code IS NOT NULL)
  AND (reason_code IS NULL
       OR reason_code IN ('customer_unreachable', 'refused', 'address_problem', 'other'))),
CONSTRAINT shipment_events_actor_check CHECK (actor_type IN ('shop_member', 'platform_staff', 'system')
  AND (actor_type = 'system') = (actor_user_id IS NULL)),
CONSTRAINT shipment_events_note_check CHECK (note IS NULL OR char_length(note) <= 500)
```

A tracking correction ([05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment), `shipped → shipped`) is recorded as `event = 'shipped'`, `status = 'shipped'` with the note "tracking corrected"; `shipment_events_status_check` accepts it without a separate event value.

**Indexes.** `shipment_events_shipment_idx (shipment_id, created_at, id)` serves the tracking timeline. If OD-18 adopts the repeat-refuser COD rule (`cod_max_refusals`, §15.1), `shipment_events_refused_idx (created_at) WHERE reason_code = 'refused'` is added with it to count a customer's refusals in the window. It is not created before that decision.

**Lifecycle and retention.** Insert-only. Retained as §11.1. `note` is not redacted at the end of the period (append-only, [04 §2.12](04-domain-model-and-data-dictionary.md)); it follows the no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md).

### 11.7 `return_requests`

**Module** `orders` · **Release** R1 (created by support staff, FR-RET-006); R2 self-serve · **Shop scope** `shop_id` · **Lifecycle** Entity · **Sensitivity** Personal

A return of delivered units, created by support on the customer's behalf in R1 because the Consumer Protection Act 2075 s14 and E-Commerce Act s10 make returns an R1 obligation [Verify-external VX-04, VX-02] (canon §17.4). Machine: [05 §6.6](05-order-payment-and-inventory-lifecycles.md#66-returnrequest-r1-support-created-r2-self-serve).

| Column                                 | Type        | Null | Default       | Notes                                                                                                                                                                                                        |
| -------------------------------------- | ----------- | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                   | uuid        | no   | `uuidv7()`    |                                                                                                                                                                                                              |
| `number`                               | text        | no   | App           | `RT-` + 7 Crockford base32                                                                                                                                                                                   |
| `order_id`, `shop_order_id`, `shop_id` | uuid        | no   | App           |                                                                                                                                                                                                              |
| `requested_by_user_id`                 | uuid        | no   | App           | The customer. The composite FK below proves it is the order's customer                                                                                                                                       |
| `created_by_staff_id`                  | uuid        | yes  | —             | The support agent. Always set in R1; null for R2 self-serve                                                                                                                                                  |
| `support_case_id`                      | uuid        | yes  | —             | The case the return came from, if any. A case of the same customer only (`return_requests_case_fkey`)                                                                                                        |
| `reason_code`                          | text        | no   | App           | `not_as_described`, `damaged`, `wrong_item`, `size_issue`, `changed_mind`, `other`                                                                                                                           |
| `status`                               | text        | no   | `'requested'` | `requested`, `approved`, `rejected`, `in_transit`, `received`, `closed`, `rejected_after_inspection`                                                                                                         |
| `customer_note`                        | text        | yes  | —             | At most 1,000 characters                                                                                                                                                                                     |
| `resolution_note`                      | text        | yes  | —             | Required when `rejected` or `rejected_after_inspection`; the customer sees it                                                                                                                                |
| `approved_at`                          | timestamptz | yes  | —             |                                                                                                                                                                                                              |
| `refund_due_at`                        | timestamptz | yes  | —             | Set at approval: `approved_at + 7 days`, the conservative start of the Directive 2082 s9(3) refund clock ([05 §11](05-order-payment-and-inventory-lifecycles.md#11-legal-overlays); [Verify-external VX-02]) |
| `received_at`, `closed_at`             | timestamptz | yes  | —             |                                                                                                                                                                                                              |
| `version`                              | int         | no   | `1`           |                                                                                                                                                                                                              |
| `created_at`, `updated_at`             | timestamptz | no   | `now()`       |                                                                                                                                                                                                              |

**Keys and constraints.**

```sql
CONSTRAINT return_requests_pkey PRIMARY KEY (id),
CONSTRAINT return_requests_number_key UNIQUE (number),
CONSTRAINT return_requests_number_check CHECK (number ~ '^RT-[0-9A-HJKMNP-TV-Z]{7}$'),
CONSTRAINT return_requests_id_shop_order_id_key UNIQUE (id, shop_order_id),   -- target for §11.8, §12.4
CONSTRAINT return_requests_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT return_requests_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT return_requests_customer_fkey FOREIGN KEY (order_id, requested_by_user_id)
  REFERENCES orders (id, customer_user_id) ON DELETE RESTRICT,
CONSTRAINT return_requests_staff_fkey FOREIGN KEY (created_by_staff_id)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT return_requests_case_fkey FOREIGN KEY (support_case_id, requested_by_user_id)
  REFERENCES support_cases (id, customer_user_id) ON DELETE RESTRICT,     -- MATCH SIMPLE: null support_case_id allowed
CONSTRAINT return_requests_status_check CHECK (status IN ('requested', 'approved', 'rejected',
  'in_transit', 'received', 'closed', 'rejected_after_inspection')),
CONSTRAINT return_requests_reason_check CHECK (reason_code IN ('not_as_described', 'damaged',
  'wrong_item', 'size_issue', 'changed_mind', 'other')),
CONSTRAINT return_requests_approved_check CHECK (status IN ('requested', 'rejected')
  OR (approved_at IS NOT NULL AND refund_due_at IS NOT NULL)),
CONSTRAINT return_requests_received_check
  CHECK (status NOT IN ('received', 'closed', 'rejected_after_inspection') OR received_at IS NOT NULL),
CONSTRAINT return_requests_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
CONSTRAINT return_requests_resolution_check
  CHECK (status NOT IN ('rejected', 'rejected_after_inspection') OR resolution_note IS NOT NULL),
CONSTRAINT return_requests_notes_check CHECK (char_length(coalesce(customer_note, '')) <= 1000
  AND char_length(coalesce(resolution_note, '')) <= 2000)
```

`return_requests_customer_fkey` means a support agent cannot attach a return for customer X to customer Y's order, even through a bug. `return_requests_case_fkey` keeps the linked support case on the same customer (INV-03), so a mistyped `support_case_number` on `createReturnRequest` cannot attach X's return to Y's case. It references `support_cases_id_customer_user_id_key` (§14.1); under `MATCH SIMPLE` a return without a case is not checked, and a case without a customer cannot be linked. T-RET-101 (proposed) covers both links.

The window and quantity rules of [05 §6.6](05-order-payment-and-inventory-lifecycles.md#66-returnrequest-r1-support-created-r2-self-serve) span rows and are checked in the create transaction with the shop order row locked:

- The return is created while `now() ≤ shipments.return_window_ends_at` (§11.5), unless an admin override with a written reason is given for goods that do not conform to the listing (AC-FR-RET-006-1). The reason goes to the `return_request.create` audit row (AC-J20-01).
- Per item, `quantity ≤ quantity − rejected_quantity − cancelled_quantity − returned_quantity`, minus the line's units on the shop order's refunds with `reason_code` `goodwill` or `other` that are not `cancelled` (read through `refund_items_order_item_idx`, §12.5), minus the line's units in open returns (§11.8), so no unit is refunded twice.

**Indexes.**

| Index                                 | Definition                                                                              | Query served                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `return_requests_number_key`          | `(number)`                                                                              | Lookup by `{returnNumber}` (seller with `shop_id = :resolved_shop`, admin)                                                                                    |
| `return_requests_open_shop_order_idx` | `(shop_order_id) WHERE status IN ('requested','approved','in_transit','received')`      | "Open return on this shop order" in auto-complete and payout eligibility ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)) |
| `return_requests_seller_list_idx`     | `(shop_id, created_at DESC, id DESC)`                                                   | `listShopReturns`                                                                                                                                             |
| `return_requests_admin_queue_idx`     | `(status, created_at) WHERE status IN ('requested','approved','in_transit','received')` | Admin returns queue by status                                                                                                                                 |
| `return_requests_refund_due_idx`      | `(refund_due_at) WHERE status IN ('approved','in_transit','received')`                  | Refund SLA monitor before the refund exists: `WHERE refund_due_at < now() + interval '2 days'`                                                                |

**Lifecycle and retention.** Status changes by compare-and-set. Never deleted. The Directive s14 lists consumer complaints among the records to keep at least five years; returns are kept with the order record, 7 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]), and are kept unchanged when the customer is anonymised ([04 §19.2](04-domain-model-and-data-dictionary.md)). At the end of the period the retention command sets `customer_note` to null, and `resolution_note` to null or, on a return in `rejected` or `rejected_after_inspection`, where `return_requests_resolution_check` requires a value, to the fixed placeholder `'Redacted'`; the table has no guard trigger, so this is a plain `UPDATE`.

### 11.8 `return_items`

**Module** `orders` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record · **Sensitivity** Internal

The lines and units of a return, with the shop's condition notes and support's restock decision.

| Column                     | Type        | Null | Default | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ----------- | ---- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `return_request_id`        | uuid        | no   | App     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `order_item_id`            | uuid        | no   | App     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `shop_order_id`            | uuid        | no   | App     | Carried for the two composite FKs                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `quantity`                 | int         | no   | App     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `condition_note`           | text        | yes  | —       | Written at receipt                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `restock_quantity`         | int         | yes  | —       | Decided at close: the units of this line that go back on sale. Above 0 it writes one `return_restock` movement of that quantity ([05 §5.7](05-order-payment-and-inventory-lifecycles.md#57-return-restock)); the other units are written off, and `condition_note` then says why. Replaces the per-line `restock` boolean (05 §5.7 and `closeReturnRequest` in [06](06-api-design.md) take `restock_quantity` too), so that a damaged unit is never put back on sale with the good ones, as for RTO ([05 §5.8](05-order-payment-and-inventory-lifecycles.md#58-rto-restock)) |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**Keys and constraints.**

```sql
CONSTRAINT return_items_pkey PRIMARY KEY (return_request_id, order_item_id),
CONSTRAINT return_items_request_fkey FOREIGN KEY (return_request_id, shop_order_id)
  REFERENCES return_requests (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT return_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
  REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT return_items_quantity_check CHECK (quantity > 0),
CONSTRAINT return_items_restock_check
  CHECK (restock_quantity IS NULL OR restock_quantity BETWEEN 0 AND quantity),
CONSTRAINT return_items_condition_note_check
  CHECK (condition_note IS NULL OR char_length(condition_note) <= 1000)
```

The two composite FKs share `shop_order_id`, so a return can only list lines of its own shop order. Written with the query builder inside the owning action (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** `return_items_order_item_idx (order_item_id)` serves "units of this line in open returns" (§11.7): `SELECT SUM(ri.quantity) FROM return_items ri JOIN return_requests rr ON rr.id = ri.return_request_id WHERE ri.order_item_id = :i AND rr.status IN ('requested','approved','in_transit','received')`. Closed returns are already counted in `order_items.returned_quantity` and are not summed again.

**Lifecycle and retention.** Inserted with the return. `condition_note` and `restock_quantity` are written once each. Retained as §11.7; at the end of the period the retention command sets `condition_note` to null ([04 §19.3](04-domain-model-and-data-dictionary.md)).

---

## 12. Payments and refunds

The `payments` module owns these tables. All of them are created in the R0 baseline, including the gateway columns and `provider_events` that are first used in R1.1 ([04 §1.2](04-domain-model-and-data-dictionary.md)): the ledger and refund tables reference them, and adding them later would be a disruptive migration. The machines are [05 §6.4, §6.5 and §6.7](05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11). Provider behaviour is summarised in canon §17.1 and must be confirmed in each sandbox (VX-06 eSewa, VX-07 Khalti); which gateway comes first is [Open OD-03].

**Provider identifiers.** Each provider exposes different handles. They map to columns as follows:

| Column                               | Khalti KPG-2                                          | eSewa ePay v2                                        |
| ------------------------------------ | ----------------------------------------------------- | ---------------------------------------------------- |
| Our attempt key sent to the provider | `purchase_order_id = payments.id`                     | `transaction_uuid = payments.id`                     |
| `provider_payment_id`                | `pidx` from the initiate response                     | null (eSewa's session key is our `transaction_uuid`) |
| `provider_reference`                 | `transaction_id` from lookup; the refund API needs it | `ref_id` from the status check (null while pending)  |
| `expires_at`                         | `expires_at` from the initiate response               | form render + `reservation_ttl_minutes` [Assumption] |

Sources: Khalti initiate, lookup and refund [Verified-doc <https://docs.khalti.com/khalti-epayment/>, <https://docs.khalti.com/api/refund/>]; eSewa form and status check [Verified-doc <https://developer.esewa.com.np/pages/Epay>].

### 12.1 `payments`

**Module** `payments` · **Release** R1 (COD); gateway columns from R1.1 · **Shop scope** none (order-level; COD rows point at one shop order) · **Lifecycle** Record · **Sensitivity** Financial

One gateway attempt for a whole order, or one COD collection per shop order ([05 §2.3](05-order-payment-and-inventory-lifecycles.md#23-what-it-costs)).

| Column                                      | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                        | uuid        | no   | `uuidv7()` | Also the provider attempt key                                                                                                                                                                                                                                                                                                                                                                                                         |
| `order_id`                                  | uuid        | no   | App        |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `shop_order_id`                             | uuid        | yes  | —          | Set for COD (one payment per shop order), null for gateway                                                                                                                                                                                                                                                                                                                                                                            |
| `method`                                    | text        | no   | App        | `cod`, `esewa`, `khalti`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `status`                                    | text        | no   | App        | COD: `awaiting_collection`, `collected`, `not_collected`, `cancelled`. Gateway: `initiated`, `pending`, `captured`, `failed`, `expired`, `cancelled`, `needs_review`                                                                                                                                                                                                                                                                  |
| `amount_minor`                              | bigint      | no   | App        | To collect or capture. A COD amount only decreases, and only while `awaiting_collection` (item-level rejection)                                                                                                                                                                                                                                                                                                                       |
| `currency`                                  | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `captured_minor`                            | bigint      | no   | `0`        | Equals `amount_minor` once `captured` or `collected`                                                                                                                                                                                                                                                                                                                                                                                  |
| `refunded_minor`                            | bigint      | no   | `0`        | Increased when a refund succeeds                                                                                                                                                                                                                                                                                                                                                                                                      |
| `captured_at`                               | timestamptz | yes  | —          | Capture or cash collection time                                                                                                                                                                                                                                                                                                                                                                                                       |
| `is_late_capture`                           | boolean     | no   | `false`    | (proposed, [05 §6.4](05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11)) Set to true in the same UPDATE as a late capture of a superseded attempt (a newer attempt exists) or of an attempt whose shop orders are terminal. Such a row never counts as the order's captured attempt: it stays outside `payments_one_live_gateway_attempt_key`, and its money is refunded per allocation with `late_capture` refunds |
| `provider_payment_id`, `provider_reference` | text        | yes  | —          | Table above                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `attempt_no`                                | smallint    | no   | `1`        | Gateway retries create a new row with `attempt_no + 1`                                                                                                                                                                                                                                                                                                                                                                                |
| `expires_at`                                | timestamptz | yes  | —          | Gateway session expiry                                                                                                                                                                                                                                                                                                                                                                                                                |
| `verification_attempts`                     | int         | no   | `0`        | Lookups made                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `next_verification_at`                      | timestamptz | yes  | —          | Schedule and lease for `payments.verify` ([05 §9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)); null once polling ends, for example for a `needs_review` payment 48 h after redirect                                                                                                                                                                                                                   |
| `last_provider_status`                      | text        | yes  | —          | Raw status string from the last lookup, for the review queue                                                                                                                                                                                                                                                                                                                                                                          |
| `version`                                   | int         | no   | `1`        |                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `created_at`, `updated_at`                  | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                                                                                                       |

**Keys and constraints.**

```sql
CONSTRAINT payments_pkey PRIMARY KEY (id),
CONSTRAINT payments_id_order_id_key UNIQUE (id, order_id),              -- target for §12.2, §12.4
CONSTRAINT payments_provider_payment_key UNIQUE (method, provider_payment_id),   -- NULLs are distinct
CONSTRAINT payments_order_fkey FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE RESTRICT,
CONSTRAINT payments_cod_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT payments_method_check CHECK (method IN ('cod', 'esewa', 'khalti')),
CONSTRAINT payments_status_check CHECK (
     (method = 'cod'  AND status IN ('awaiting_collection', 'collected', 'not_collected', 'cancelled'))
  OR (method <> 'cod' AND status IN ('initiated', 'pending', 'captured', 'failed', 'expired',
                                     'cancelled', 'needs_review'))),
CONSTRAINT payments_cod_shape_check CHECK ((method = 'cod') = (shop_order_id IS NOT NULL)
  AND (method <> 'cod' OR (provider_payment_id IS NULL AND provider_reference IS NULL AND expires_at IS NULL))),
CONSTRAINT payments_currency_check CHECK (currency = 'NPR'),
CONSTRAINT payments_amount_check CHECK (amount_minor > 0),
CONSTRAINT payments_captured_le_amount_check CHECK (captured_minor >= 0 AND captured_minor <= amount_minor),
CONSTRAINT payments_refunded_le_captured_check CHECK (refunded_minor >= 0 AND refunded_minor <= captured_minor),
CONSTRAINT payments_captured_state_check CHECK (CASE WHEN status IN ('captured', 'collected')
  THEN captured_minor = amount_minor AND captured_at IS NOT NULL
  ELSE captured_minor = 0 AND captured_at IS NULL END),
CONSTRAINT payments_counters_check CHECK (attempt_no >= 1 AND verification_attempts >= 0)
```

```sql
CREATE UNIQUE INDEX payments_one_live_gateway_attempt_key ON payments (order_id)
  WHERE method <> 'cod' AND status IN ('initiated', 'pending', 'captured') AND NOT is_late_capture;
CREATE UNIQUE INDEX payments_gateway_attempt_no_key ON payments (order_id, attempt_no) WHERE method <> 'cod';
CREATE UNIQUE INDEX payments_cod_shop_order_key ON payments (shop_order_id) WHERE method = 'cod';

-- A payment amount never grows; a COD amount shrinks only before collection (Directive 2082 s8(3))
CREATE OR REPLACE FUNCTION payments_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.amount_minor <> OLD.amount_minor AND NOT (OLD.method = 'cod'
       AND OLD.status = 'awaiting_collection' AND NEW.amount_minor < OLD.amount_minor) THEN
    RAISE EXCEPTION 'payments.amount_minor may only decrease on an uncollected COD payment'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER payments_amount_guard BEFORE UPDATE OF amount_minor ON payments
  FOR EACH ROW EXECUTE FUNCTION payments_amount_guard();
```

- `payments_one_live_gateway_attempt_key` is the database form of the "one live gateway attempt per order" rule (INV-16). Its `AND NOT is_late_capture` term (proposed) keeps a superseded late capture outside it: that attempt is set to `captured` while a newer attempt may be `initiated`, `pending` or `captured`, so without the term the capture would fail with 23505 on every run, and the customer's second charge could be neither recorded nor refunded ([05 §6.4](05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11)). The parent `orders` lock serialises concurrent `startOrderPayment` retries: the second waits, finds the first retry's attempt in flight and gets 409 `CONFLICT` with `Retry-After: 2` ([05 §4.8](05-order-payment-and-inventory-lifecycles.md#48-gateway-initiation-after-commit-r11)). The index is only the backstop: 23505 on it means a code path skipped the lock, which answers 500 `INTERNAL` with an alert ([04 §16.5](04-domain-model-and-data-dictionary.md)). T-PAY-101 (proposed).
- `payments_refunded_le_captured_check` is the database backstop for "refunds never exceed what was captured". The refund action checks the refundable amount first and returns 422 `REFUND_EXCEEDS_REFUNDABLE`; the CHECK stops a bug that skips that check (T-SEC-004).
- `payments_cod_shop_order_key` guarantees one cash collection per parcel, and `payments_amount_guard` means the amount a courier may collect can go down (rejected items) but never up. Directive 2082 s8(3) bars collecting more than the pre-agreed price and transport at handover [Verify-external VX-02]. T-PAY-102 (proposed).
- That `payments.method` equals `orders.payment_method` spans two tables and is set by the checkout action only.

**Indexes.**

| Index                            | Definition                                                                                          | Query served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments_order_idx`             | `(order_id)`                                                                                        | Payments of an order: order pages, refund creation, capture                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `payments_verify_due_idx`        | `(next_verification_at) WHERE method <> 'cod' AND status IN ('initiated','pending','needs_review')` | `payments.reconcile_sweeper`: `WHERE method <> 'cod' AND status IN ('initiated','pending','needs_review') AND next_verification_at <= now() - interval '5 minutes'`, which also finds a `needs_review` payment still polled ([05 §9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)); the expiry job's lease keeps `status IN ('initiated','pending') AND next_verification_at <= now() … FOR UPDATE SKIP LOCKED`, a subset of the predicate ([05 §5.4](05-order-payment-and-inventory-lifecycles.md#54-expiration-job) B1) |
| `payments_needs_review_idx`      | `(created_at) WHERE status = 'needs_review'`                                                        | Admin review queue sorted by age ([05 §9.5](05-order-payment-and-inventory-lifecycles.md#95-manual-review-queue-needs_review))                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `payments_cod_uncollected_idx`   | `(shop_order_id) WHERE method = 'cod' AND status = 'awaiting_collection'`                           | Admin "COD outcome missing" list ([05 §8.9](05-order-payment-and-inventory-lifecycles.md#89-cod-refusal-and-collection-reconciliation)): `WHERE method = 'cod' AND status = 'awaiting_collection'` joined through `shipments_shop_order_key` to `status = 'delivered' AND delivered_at < now() - interval '3 days'` (§11.5). The partial index holds only open COD collections                                                                                                                                                                          |
| `payments_provider_payment_key`  | `(method, provider_payment_id)`                                                                     | Return handler and webhook: find our attempt by `pidx`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| the three partial unique indexes | above                                                                                               | COD payment of a shop order; live attempt of an order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. Financial record: 7 years after the payment reaches a terminal status ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 12.2 `payment_allocations`

**Module** `payments` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record · **Sensitivity** Financial

How much of a payment belongs to each shop order. A gateway payment has one allocation per shop order; a COD payment has exactly one ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step)). Refunds are capped per allocation.

| Column                             | Type        | Null | Default | Notes                                                                                  |
| ---------------------------------- | ----------- | ---- | ------- | -------------------------------------------------------------------------------------- |
| `payment_id`, `shop_order_id`      | uuid        | no   | App     | Composite primary key                                                                  |
| `order_id`                         | uuid        | no   | App     | Carried for the composite FKs                                                          |
| `amount_minor`                     | bigint      | no   | App     | `shop_orders.total_minor` at placement; reduced with the COD payment on item rejection |
| `captured_minor`, `refunded_minor` | bigint      | no   | `0`     | Mirror the payment per shop order                                                      |
| `currency`                         | char(3)     | no   | `'NPR'` |                                                                                        |
| `created_at`, `updated_at`         | timestamptz | no   | `now()` |                                                                                        |

**Keys and constraints.**

```sql
CONSTRAINT payment_allocations_pkey PRIMARY KEY (payment_id, shop_order_id),   -- target for §12.4
CONSTRAINT payment_allocations_payment_fkey FOREIGN KEY (payment_id, order_id)
  REFERENCES payments (id, order_id) ON DELETE RESTRICT,
CONSTRAINT payment_allocations_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT payment_allocations_amounts_check CHECK (amount_minor > 0 AND captured_minor >= 0
  AND captured_minor <= amount_minor AND refunded_minor >= 0 AND refunded_minor <= captured_minor),
CONSTRAINT payment_allocations_currency_check CHECK (currency = 'NPR')
```

The two FKs share `order_id`, so a payment can only be allocated to shop orders of the order it pays ([04 §2.5](04-domain-model-and-data-dictionary.md)). Σ allocations = `payments.amount_minor` spans rows, as do the sums of `captured_minor` and `refunded_minor`: the checkout, capture, rejection and refund actions write the payment and its allocations in one transaction. A nightly check (`ledger.integrity_check` check 7, [05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)) re-checks, per payment, that the three allocation sums equal the payment's `amount_minor`, `captured_minor` and `refunded_minor`, that a COD payment has exactly one allocation, for its own `shop_order_id`, and, per allocation, that `refunded_minor` equals the `amount_minor` sum of its `succeeded` refunds. Written with the query builder (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** `payment_allocations_shop_order_idx (shop_order_id)` serves the refundable amount of a shop order and the payout "held" check.

**Lifecycle and retention.** As §12.1.

### 12.3 `provider_events`

**Module** `payments` · **Release** R1.1 (created in R0, [04 §1.2](04-domain-model-and-data-dictionary.md)) · **Shop scope** none · **Lifecycle** Record · **Sensitivity** Financial; payer data redacted

Every message exchanged with a provider about a payment or refund: redirects to our return URL, webhooks, lookups, initiations and refund calls. It deduplicates inbound messages and is the evidence trail for the review queue. No state changes on a message alone: a verification lookup always decides (ADR-0012).

| Column               | Type        | Null | Default     | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------- | ----------- | ---- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                 | uuid        | no   | `uuidv7()`  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `provider`           | text        | no   | App         | `esewa`, `khalti`                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `provider_event_key` | text        | no   | App         | Deterministic key, below                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `kind`               | text        | no   | App         | `initiate`, `return`, `webhook`, `lookup`, `refund`, `refund_lookup`                                                                                                                                                                                                                                                                                                                                                                                           |
| `payment_id`         | uuid        | yes  | —           | For an inbound message, null only when a signed webhook verifies but matches no payment: an unmatched return, or an unsigned callback that matches no payment, is not stored and leaves only a `provider.message_rejected` log line ([07 TM-17](07-security-threat-model-and-permissions.md#tm-17-payment-spoofing-through-provider-redirects-r11), [TM-18](07-security-threat-model-and-permissions.md#tm-18-provider-event-replay-and-forged-callbacks-r11)) |
| `refund_id`          | uuid        | yes  | —           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `payload`            | jsonb       | no   | App         | Redacted: only the provider's documented fields, each capped at 256 characters [Assumption], never the whole body; the payer mobile number that Khalti returns becomes its last four digits; no names                                                                                                                                                                                                                                                          |
| `raw_body_sha256`    | bytea       | yes  | —           | SHA-256 of the raw body as received, proving what arrived without keeping it                                                                                                                                                                                                                                                                                                                                                                                   |
| `signature_valid`    | boolean     | yes  | —           | False for a missing or invalid signature on a stored message from a provider that signs (an eSewa return on a matched attempt; such a webhook is answered 401 and not stored). Null only for message types the provider never signs, such as the Khalti return (Khalti's return URL carries no signature [Verified-doc Khalti docs above])                                                                                                                     |
| `received_at`        | timestamptz | no   | `now()`     |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `processed_at`       | timestamptz | yes  | —           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `processing_status`  | text        | no   | `'pending'` | `pending`, `processed`, `ignored`, `failed`                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `error`              | text        | yes  | —           | At most 2,000 characters, redacted                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `request_id`         | text        | yes  | —           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

**Event keys.** Return: `return:<attempt key>:<provider status>`, stored only when the attempt key resolves to a gateway payment of that provider. Webhook from a provider that signs: the provider's event id, used only after the signature verifies, else `webhook:<hex sha256 of body>` of the verified body. Webhook from an unsigned provider: stored only when its reference matches a gateway payment of that provider, keyed `webhook:<payment id>:<provider status>` (proposed, [07 TM-18](07-security-threat-model-and-permissions.md#tm-18-provider-event-replay-and-forged-callbacks-r11)), never by the body, so varying the body cannot add rows. In the return key and the unsigned webhook key, `<provider status>` is mapped to the provider's documented statuses and anything else becomes `unknown`: 1,000 returns with random statuses, or 1,000 unsigned callbacks with varied bodies, for one matched payment give at most one row per documented status plus `unknown` (T-SEC-021, proposed in 07). Initiate: `initiate:<payment id>`. Lookup: `lookup:<payment id>:<provider status>`. Refund call: `refund:<refund id>:<attempt>`; refund lookup `refund_lookup:<refund id>:<provider status>`. Keying lookups by status collapses the thirty "still Initiated" answers of the first half hour into one row, so the table grows by about three rows per payment instead of forty; `payments.verification_attempts` keeps the count, and `refunds.verification_attempts` keeps it for refund lookups (§12.4), whose repeated identical answers collapse the same way.

**Keys and constraints.**

```sql
CONSTRAINT provider_events_pkey PRIMARY KEY (id),
CONSTRAINT provider_events_key UNIQUE (provider, provider_event_key),
CONSTRAINT provider_events_payment_fkey FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE RESTRICT,
CONSTRAINT provider_events_refund_fkey FOREIGN KEY (refund_id) REFERENCES refunds (id) ON DELETE RESTRICT,
CONSTRAINT provider_events_provider_check CHECK (provider IN ('esewa', 'khalti')),
CONSTRAINT provider_events_kind_check
  CHECK (kind IN ('initiate', 'return', 'webhook', 'lookup', 'refund', 'refund_lookup')),
CONSTRAINT provider_events_subject_check CHECK (
      (kind NOT IN ('initiate', 'lookup') OR payment_id IS NOT NULL)
  AND (kind NOT IN ('refund', 'refund_lookup') OR refund_id IS NOT NULL)),
CONSTRAINT provider_events_processing_check
  CHECK (processing_status IN ('pending', 'processed', 'ignored', 'failed')
  AND (processing_status = 'pending') = (processed_at IS NULL)),
CONSTRAINT provider_events_key_check CHECK (char_length(provider_event_key) BETWEEN 8 AND 200),
CONSTRAINT provider_events_payload_check CHECK (jsonb_typeof(payload) = 'object'),
CONSTRAINT provider_events_hash_check CHECK (raw_body_sha256 IS NULL OR octet_length(raw_body_sha256) = 32)
```

The handler inserts with `ON CONFLICT (provider, provider_event_key) DO NOTHING` and responds 200 after the durable insert; processing runs in a job. The same webhook delivered N times, concurrently or not, yields one row and one state change (T-PAY-005).

**Indexes.**

| Index                         | Definition                                                      | Query served                                     |
| ----------------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `provider_events_key`         | `(provider, provider_event_key)`                                | Dedupe on insert                                 |
| `provider_events_pending_idx` | `(received_at) WHERE processing_status IN ('pending','failed')` | Processing sweeper for events whose job was lost |
| `provider_events_payment_idx` | `(payment_id, received_at) WHERE payment_id IS NOT NULL`        | Review queue: lookup history of a payment        |
| `provider_events_refund_idx`  | `(refund_id, received_at) WHERE refund_id IS NOT NULL`          | Refund review history                            |

**Lifecycle and retention.** `payload` never changes; only the processing columns do. Retained with the payment, 7 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]), because it is the evidence in a payment dispute; the retention command then replaces `payload` with an empty object `'{}'`, which is how "delete `provider_events.payload`" in [04 §19.3](04-domain-model-and-data-dictionary.md) satisfies `payload NOT NULL` and `provider_events_payload_check`.

### 12.4 `refunds`

**Module** `payments` · **Release** R1 (`manual_transfer`); `gateway_api` and `gateway_manual` from R1.1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial; `recipient_details_enc` Sensitive-personal

Money returned to a customer for one shop order, from one payment allocation. Methods per canon §17.1: `gateway_api` (Khalti refund API), `gateway_manual` (eSewa, which documents no refund API: an operator refunds in the merchant portal and records the reference), `manual_transfer` (COD and any fallback). Machine: [05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund).

| Column                                               | Type        | Null | Default       | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------- | ----------- | ---- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                 | uuid        | no   | `uuidv7()`    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `order_id`, `shop_order_id`, `shop_id`, `payment_id` | uuid        | no   | App           | `shop_id` is copied from the locked shop order                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `return_request_id`                                  | uuid        | yes  | —             | Set when the refund closes a return                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `replaces_refund_id`                                 | uuid        | yes  | —             | (proposed, [05 §8.8](05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)) The `cancelled` refund of the same shop order that this one replaces (a method switch). `createRefund` copies the replaced refund's `due_at`, `refund_items` and `affects_vendor_ledger` ([05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective), [§6.7](05-order-payment-and-inventory-lifecycles.md#67-refund), [§7.4](05-order-payment-and-inventory-lifecycles.md#74-refund-postings-and-commission-reversal), [§8.8](05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)), so a method switch never restarts the 7-day deadline or changes amounts or ledger effect |
| `amount_minor`                                       | bigint      | no   | App           | Σ `refund_items.amount_minor` + shipping part ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `currency`                                           | char(3)     | no   | `'NPR'`       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `method`                                             | text        | no   | App           | `gateway_api`, `gateway_manual`, `manual_transfer`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `status`                                             | text        | no   | `'requested'` | `requested`, `approved`, `processing`, `succeeded`, `failed`, `cancelled`, `needs_review`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `reason_code`                                        | text        | no   | App           | `order_cancelled`, `items_rejected`, `undeliverable`, `return_accepted`, `late_capture`, `stock_unavailable_after_payment`, `goodwill`, `other`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `affects_vendor_ledger`                              | boolean     | no   | App           | (proposed, [05 §7.4](05-order-payment-and-inventory-lifecycles.md#74-refund-postings-and-commission-reversal)) Set in the create TX and never updated: true only when `reason_code` is `return_accepted`, `goodwill` or `other` and the shop order's delivery posting (`dedupe_key` `delivery:<so>:sale`) already exists; a replacement copies the replaced refund's value. Only a refund with this flag posts `refund` and `commission_reversal` entries when it succeeds (§13.1)                                                                                                                                                                                                                                                                                                                              |
| `note`                                               | text        | yes  | —             | At most 2,000 characters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `due_at`                                             | timestamptz | no   | App           | 7-day deadline (Directive 2082 s9(3) [Verify-external VX-02]): the return's `refund_due_at` for return refunds, otherwise `created_at + 7 days` (AC-FR-RET-007-1); a refund with `replaces_refund_id` copies the replaced refund's `due_at`, because the obligation started with the first refund                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `provider_refund_id`                                 | text        | yes  | —             | Provider's refund reference, where one is returned                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `provider_idempotency_key`                           | text        | no   | App           | `refunds.id` as text; sent wherever the provider accepts it ([05 §9.3](05-order-payment-and-inventory-lifecycles.md#93-provider-idempotency-keys))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `attempts`                                           | int         | no   | `0`           | Executions: incremented at every `approved → processing` (all methods) and every `failed → processing`, so it counts the first execution and each retry; `retryRefund` requires `attempts < 4` ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `verification_attempts`                              | int         | no   | `0`           | Lookups made by `refunds.verify` since the refund last entered `processing`; reset to 0 at every `approved → processing` and `failed → processing`. After 5 inconclusive lookups (`gateway_api`) or 3 daily checks (`gateway_manual`) the refund moves to `needs_review` ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund), [§9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)). Kept on the row because repeated identical answers share one `provider_events` row (§12.3) and a count in the job payload would restart when `refunds.reconcile_sweeper` re-sends a lost job                                                                                                                                                                                     |
| `next_verification_at`                               | timestamptz | yes  | —             | Schedule and lease for `refunds.verify` ([05 §9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule)); null when no lookup is scheduled: every move out of `processing` (to `succeeded`, `failed` or `needs_review`) sets it to null in the same `UPDATE`, which `refunds_verification_check` requires. A `needs_review` refund is looked up again only through "Check with provider now" ([05 §9.5](05-order-payment-and-inventory-lifecycles.md#95-manual-review-queue-needs_review))                                                                                                                                                                                                                                                                                                  |
| `created_by`                                         | uuid        | yes  | —             | The acting staff user for `createRefund` (including a `replaces_refund_id` replacement) and for the refund created by `closeReturnRequest`; null only for system refunds (rejection, cancellation, RTO, a failed re-reserve after payment, late capture)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `approved_by`                                        | uuid        | yes  | —             | Null while `requested` (and on a refund cancelled from `requested`). After approval it is null only for an auto-approved system refund (`order_cancelled`, `items_rejected`, `undeliverable`, `stock_unavailable_after_payment`; `refunds_approver_check`); a system `late_capture` refund waits for a finance approver ([05 §6.4](05-order-payment-and-inventory-lifecycles.md#64-payment-gateway-r11))                                                                                                                                                                                                                                                                                                                                                                                                        |
| `is_single_operator_approval`                        | boolean     | no   | `false`       | True when `single_operator_mode` allowed self-approval with TOTP re-entry (OD-14); the audit row is flagged too                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `recipient_details_enc`                              | text        | yes  | —             | `manual_transfer` only: encrypted JSON `{account_name, bank_or_wallet, account_number}` ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `paid_reference`                                     | text        | yes  | —             | Bank or wallet transfer reference; for `gateway_manual` the provider's reference                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `approved_at`, `succeeded_at`                        | timestamptz | yes  | —             |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `version`                                            | int         | no   | `1`           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `created_at`, `updated_at`                           | timestamptz | no   | `now()`       |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

**Keys and constraints.**

```sql
CONSTRAINT refunds_pkey PRIMARY KEY (id),
CONSTRAINT refunds_provider_idempotency_key_key UNIQUE (provider_idempotency_key),
CONSTRAINT refunds_id_shop_id_key UNIQUE (id, shop_id),                 -- target for §13.1
CONSTRAINT refunds_id_shop_order_id_key UNIQUE (id, shop_order_id),     -- target for §12.5 and self-reference (refunds_replaces_fkey, proposed)
CONSTRAINT refunds_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT refunds_shop_order_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT refunds_payment_fkey FOREIGN KEY (payment_id, order_id)
  REFERENCES payments (id, order_id) ON DELETE RESTRICT,
CONSTRAINT refunds_allocation_fkey FOREIGN KEY (payment_id, shop_order_id)
  REFERENCES payment_allocations (payment_id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refunds_return_fkey FOREIGN KEY (return_request_id, shop_order_id)
  REFERENCES return_requests (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refunds_replaces_fkey FOREIGN KEY (replaces_refund_id, shop_order_id)   -- proposed
  REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refunds_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT refunds_approved_by_fkey FOREIGN KEY (approved_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT refunds_amount_check CHECK (amount_minor > 0),
CONSTRAINT refunds_currency_check CHECK (currency = 'NPR'),
CONSTRAINT refunds_method_check CHECK (method IN ('gateway_api', 'gateway_manual', 'manual_transfer')),
CONSTRAINT refunds_status_check CHECK (status IN ('requested', 'approved', 'processing', 'succeeded',
  'failed', 'cancelled', 'needs_review')),
CONSTRAINT refunds_reason_check CHECK (reason_code IN ('order_cancelled', 'items_rejected', 'undeliverable',
  'return_accepted', 'late_capture', 'stock_unavailable_after_payment', 'goodwill', 'other')),
CONSTRAINT refunds_return_reason_check
  CHECK ((reason_code = 'return_accepted') = (return_request_id IS NOT NULL)),
CONSTRAINT refunds_maker_checker_check CHECK (approved_by IS NULL OR created_by IS NULL
  OR approved_by <> created_by OR is_single_operator_approval),
CONSTRAINT refunds_approver_check CHECK (status IN ('requested', 'cancelled') OR approved_by IS NOT NULL
  OR (created_by IS NULL AND reason_code IN ('order_cancelled', 'items_rejected', 'undeliverable',
                                             'stock_unavailable_after_payment'))),
CONSTRAINT refunds_vendor_ledger_check                                           -- proposed
  CHECK (NOT affects_vendor_ledger OR reason_code IN ('return_accepted', 'goodwill', 'other')),
CONSTRAINT refunds_approved_check
  CHECK (status IN ('requested', 'cancelled') OR approved_at IS NOT NULL),
CONSTRAINT refunds_succeeded_check CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL)
  AND (status <> 'succeeded' OR method = 'gateway_api' OR paid_reference IS NOT NULL)),
CONSTRAINT refunds_recipient_check CHECK (method <> 'manual_transfer'
  OR status NOT IN ('approved', 'processing', 'failed', 'needs_review') OR recipient_details_enc IS NOT NULL),
CONSTRAINT refunds_recipient_details_enc_check CHECK (recipient_details_enc IS NULL
  OR recipient_details_enc ~ '^v[0-9]+\.[A-Za-z0-9_-]{1,32}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$'),
CONSTRAINT refunds_attempts_check CHECK (attempts >= 0),
CONSTRAINT refunds_verification_check CHECK (verification_attempts >= 0
  AND (next_verification_at IS NULL OR status = 'processing'))
```

- `refunds_allocation_fkey` targets the allocation's primary key: a refund can only be drawn from the payment that actually paid this shop order.
- `refunds_maker_checker_check` is the canonical maker-checker rule (canon §7, OD-14). The approver differs from the creator unless the approval was flagged as single-operator. T-LED-101 (proposed; the maker-checker test of INV-23 in [04 §16.2](04-domain-model-and-data-dictionary.md)) approves one's own refund with the flag false and expects 23514.
- `refunds_approver_check` makes an approval name its approver: outside `requested` and `cancelled`, `approved_by` is set, except on a system refund (`created_by` null) of a cancellation, rejection, RTO or failed re-reserve (`order_cancelled`, `items_rejected`, `undeliverable`, `stock_unavailable_after_payment`), which the system approves in the TX that creates it ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund)). A refund created by a person and a system `late_capture` refund are always approved by a named finance officer. T-LED-101 also moves a human-created and a `late_capture` refund to `approved` with a null `approved_by` and expects 23514, while a system `items_rejected` refund still auto-approves.
- `refunds_replaces_fkey` (proposed) keeps a replacement on the same shop order. That the replaced refund is `cancelled` spans rows: `createRefund` checks it with the payment and allocation rows locked and copies its `due_at`, `refund_items` and `affects_vendor_ledger` ([05 §8.8](05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)).
- `refunds_vendor_ledger_check` (proposed) is the in-row part of `ledger.integrity_check` check 2 ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)): only a `return_accepted`, `goodwill` or `other` refund can post to the vendor ledger. Whether the delivery posting already existed spans tables and is decided by the create TX only.
- `refunds_recipient_check` requires the recipient's account details while a manual transfer is approved but not yet done. Once the refund has `succeeded`, the details may be removed by the retention command ([04 §19.3](04-domain-model-and-data-dictionary.md)) without breaking the CHECK; `refunds_recipient_details_enc_check` is the ciphertext format CHECK of §5.1 (INV-25). Both create paths, `createRefund` and `closeReturnRequest`, take the recipient details and store `recipient_details_enc` for a `manual_transfer` refund, because approval needs it; missing details answer 422 `VALIDATION_FAILED` at creation, never this CHECK's 23514 at approval.
- The refundable amount is computed per allocation ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund)): `payment_allocations.captured_minor` − Σ `amount_minor` of the refunds with the same `(payment_id, shop_order_id)` that are not `cancelled`. The shipping parts of those refunds add up to at most `shipping_fee_minor` ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order), §12.5). The paying allocation (COD, or the captured attempt without `is_late_capture`) and a late-captured allocation are never added together. Both rules span rows: the create TX computes them with the payment and allocation rows locked `FOR UPDATE` (lock level 6, [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)) and answers 422 `REFUND_EXCEEDS_REFUNDABLE`. On success, `refunded_minor` rises on both the payment and the allocation, where the CHECKs of §12.1 and §12.2 are the backstop (T-SEC-004).

**Indexes.**

| Index                               | Definition                                                                                          | Query served                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refunds_shop_order_idx`            | `(shop_order_id)`                                                                                   | Refundable amount and shipping cap per allocation (`WHERE shop_order_id = ? AND payment_id = ? AND status <> 'cancelled'`); payout "held" check; order pages                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `refunds_queue_idx`                 | `(due_at) WHERE status IN ('requested','approved','processing','failed','needs_review')`            | Admin refunds queue sorted by due date (AC-FR-RET-007-2) and the SLA monitor: `WHERE status IN (…) AND due_at < now() + interval '2 days'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `refunds_return_idx`                | `(return_request_id) WHERE return_request_id IS NOT NULL`                                           | Refund of a return (return close, SLA reporting)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `refunds_provider_refund_key`       | UNIQUE `(method, provider_refund_id) WHERE provider_refund_id IS NOT NULL`                          | Matching a provider refund status to our row; one provider refund cannot be recorded twice                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `refunds_verify_due_idx`            | `(next_verification_at) WHERE status = 'processing' AND method IN ('gateway_api','gateway_manual')` | `refunds.reconcile_sweeper`: `WHERE status = 'processing' AND method IN ('gateway_api','gateway_manual') AND next_verification_at <= now() - interval '5 minutes'` (a lost or dead-lettered verify job), as for payments (§12.1). [05 §9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule) uses the same test, because an inconclusive lookup never changes `updated_at`                                                                                                                                                                                                              |
| `refunds_gateway_api_in_flight_key` | UNIQUE `(payment_id) WHERE method = 'gateway_api' AND status IN ('processing','needs_review')`      | (proposed, [05 §8.8](05-order-payment-and-inventory-lifecycles.md#88-refund-failure-and-retry-including-esewa-without-a-refund-api)) At most one Khalti refund per payment in flight, so a status-only lookup can be decisive. The TX that moves a `gateway_api` refund to `processing` locks the payment row first; the index is the backstop, and a 23505 on it makes `refunds.execute` leave its refund unchanged and re-send itself with a 15-min delay, and `retryRefund` answer 409 `CONFLICT` ([04 §16.5](04-domain-model-and-data-dictionary.md#165-when-a-backstop-fires)). T-RET-004 (proposed in 05) |

**Lifecycle and retention.** Status by compare-and-set. Never deleted; a mistaken refund is `cancelled` before it is paid. Financial record, 7 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]); at the end the retention command sets `note` to null. `recipient_details_enc` is needed only until the transfer succeeds; [04 §19.2](04-domain-model-and-data-dictionary.md) and [04 §19.3](04-domain-model-and-data-dictionary.md) decide when it is overwritten.

### 12.5 `refund_items`

**Module** `payments` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record · **Sensitivity** Financial

The units and amounts a refund covers per order line. The amount per line is the cumulative `A(k + r) − A(k)` of [05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective). `k` is fixed once, in the TX that creates the refund, and the three amounts computed from it are stored here and never recomputed, so the ledger postings at success depend neither on when nor in which order refunds succeed ([05 §7.4](05-order-payment-and-inventory-lifecycles.md#74-refund-postings-and-commission-reversal)). A replacement refund (`refunds.replaces_refund_id`, proposed) copies the replaced refund's rows.

| Column                       | Type        | Null | Default | Notes                                                                                                                                                                                              |
| ---------------------------- | ----------- | ---- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refund_id`, `order_item_id` | uuid        | no   | App     | Composite primary key                                                                                                                                                                              |
| `shop_order_id`              | uuid        | no   | App     | Carried for the two composite FKs                                                                                                                                                                  |
| `quantity`                   | int         | no   | App     | `r`, the units refunded now                                                                                                                                                                        |
| `amount_minor`               | bigint      | no   | App     | `A(k + r) − A(k)`, on the customer's basis                                                                                                                                                         |
| `vendor_amount_minor`        | bigint      | no   | App     | (proposed, [05 §7.4](05-order-payment-and-inventory-lifecycles.md#74-refund-postings-and-commission-reversal)) `A_vendor(k + r) − A_vendor(k)`, on the vendor's basis; equals `amount_minor` in R1 |
| `commission_reversal_minor`  | bigint      | no   | App     | (proposed, [05 §7.4](05-order-payment-and-inventory-lifecycles.md#74-refund-postings-and-commission-reversal)) `C(k + r) − C(k)`                                                                   |
| `currency`                   | char(3)     | no   | `'NPR'` |                                                                                                                                                                                                    |
| `created_at`                 | timestamptz | no   | `now()` |                                                                                                                                                                                                    |

**Keys and constraints.**

```sql
CONSTRAINT refund_items_pkey PRIMARY KEY (refund_id, order_item_id),
CONSTRAINT refund_items_refund_fkey FOREIGN KEY (refund_id, shop_order_id)
  REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refund_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
  REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refund_items_quantity_check CHECK (quantity > 0),
CONSTRAINT refund_items_amount_check CHECK (amount_minor >= 0),
CONSTRAINT refund_items_vendor_amount_check CHECK (vendor_amount_minor >= 0),               -- proposed
CONSTRAINT refund_items_commission_reversal_check CHECK (commission_reversal_minor >= 0),   -- proposed
CONSTRAINT refund_items_currency_check CHECK (currency = 'NPR')
```

The shipping part of a refund (`refunds.amount_minor − Σ refund_items.amount_minor`) must be at least 0, and the shipping parts of the shop order's refunds not in `cancelled` on the same payment allocation, this one included, must add up to at most the shop order's `shipping_fee_minor` ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order)). The create action checks both under the payment and allocation locks because they span rows, and `ledger.integrity_check` check 6 re-checks them ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)).

**Indexes.** `refund_items_order_item_idx (order_item_id)` serves the refund part of `k` in the cumulative rule: Σ `quantity` of this line over the shop order's refunds not in `cancelled` whose `reason_code` is `return_accepted`, `goodwill` or `other`. `k` is that sum plus the line's `rejected_quantity + cancelled_quantity` as they stood before the create TX changed them; refunds for rejected, cancelled or undeliverable units are left out because those two counters already cover them ([05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective)). The index serves only that sum, and the `goodwill` and `other` units of the return quantity rule (§11.7).

**Lifecycle and retention.** Inserted with the refund, never updated. Retained as §12.4.

---

## 13. Ledger and payouts

The `ledger` module owns the per-shop sub-ledger of what DripNepal and each vendor owe each other (ADR-0009). It is not the platform's general ledger. Posting rules, availability and netting are owned by [05 §7](05-order-payment-and-inventory-lifecycles.md#7-vendor-ledger-and-settlement); the worked example there (§7.11) is golden test T-LED-001 (proposed). In R1 (COD only) vendors hold the customer's cash, so balances are normally negative until the vendor remits commission [Confirmed Q3–Q5]. The schema therefore allows negative balances by design.

### 13.1 `ledger_entries`

**Module** `ledger` · **Release** R1 · **Shop scope** `shop_id`, composite FKs to every referenced row · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Financial; `description` Personal (no-contact-data rule, [04 §19.1](04-domain-model-and-data-dictionary.md))

| Column                                                                      | Type        | Null | Default    | Notes                                                                                                                                                                                                                                   |
| --------------------------------------------------------------------------- | ----------- | ---- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                         |
| `shop_id`                                                                   | uuid        | no   | App        | From the locked shop order, payout or remittance row, never from input                                                                                                                                                                  |
| `entry_type`                                                                | text        | no   | App        | `sale`, `shipping_income`, `commission`, `commission_reversal`, `cod_cash_held`, `refund`, `vendor_remittance`, `payout`, `payout_reversal`, `tax_withholding`, `adjustment`                                                            |
| `amount_minor`                                                              | bigint      | no   | App        | Signed: positive means the platform owes the vendor                                                                                                                                                                                     |
| `currency`                                                                  | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                                                         |
| `shop_order_id`, `order_item_id`, `refund_id`, `payout_id`, `remittance_id` | uuid        | yes  | —          | What the entry is about; which one is required depends on the type                                                                                                                                                                      |
| `reverses_entry_id`                                                         | uuid        | yes  | —          | The entry this one reverses                                                                                                                                                                                                             |
| `available_at`                                                              | timestamptz | no   | App        | When the entry may be paid out ([05 §7.2](05-order-payment-and-inventory-lifecycles.md#72-entry-types-and-posting-rules) group rule)                                                                                                    |
| `description`                                                               | text        | no   | App        | Statement text; for `adjustment`, the reason (at least 20 characters, AC-FR-LED-005-1). Never contact data: kept for the life of the shop's ledger under the no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md) |
| `created_by`                                                                | uuid        | yes  | —          | Staff member for adjustments and remittances (for an adjustment posted when a request is approved, the requester, §13.5); null for system postings                                                                                      |
| `dedupe_key`                                                                | text        | no   | App        | Deterministic key, for example `delivery:<shop_order_id>:sale`                                                                                                                                                                          |
| `created_at`                                                                | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                         |

**Keys and constraints.**

```sql
CONSTRAINT ledger_entries_pkey PRIMARY KEY (id),
CONSTRAINT ledger_entries_dedupe_key_key UNIQUE (dedupe_key),
CONSTRAINT ledger_entries_id_shop_id_key UNIQUE (id, shop_id),          -- target for §13.3, §13.5 and self-reference
CONSTRAINT ledger_entries_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_order_item_fkey FOREIGN KEY (order_item_id, shop_id)
  REFERENCES order_items (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_refund_fkey FOREIGN KEY (refund_id, shop_id)
  REFERENCES refunds (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_payout_fkey FOREIGN KEY (payout_id, shop_id)
  REFERENCES payouts (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_remittance_fkey FOREIGN KEY (remittance_id, shop_id)
  REFERENCES vendor_remittances (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_reverses_fkey FOREIGN KEY (reverses_entry_id, shop_id)
  REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT ledger_entries_type_check CHECK (entry_type IN ('sale', 'shipping_income', 'commission',
  'commission_reversal', 'cod_cash_held', 'refund', 'vendor_remittance', 'payout', 'payout_reversal',
  'tax_withholding', 'adjustment')),
CONSTRAINT ledger_entries_currency_check CHECK (currency = 'NPR'),
CONSTRAINT ledger_entries_sign_check CHECK (CASE entry_type
  WHEN 'sale'                THEN amount_minor >= 0
  WHEN 'shipping_income'     THEN amount_minor >= 0
  WHEN 'commission_reversal' THEN amount_minor >= 0
  WHEN 'vendor_remittance'   THEN amount_minor > 0
  WHEN 'payout_reversal'     THEN amount_minor > 0
  WHEN 'commission'          THEN amount_minor <= 0
  WHEN 'cod_cash_held'       THEN amount_minor <= 0
  WHEN 'refund'              THEN amount_minor <= 0
  WHEN 'tax_withholding'     THEN amount_minor <= 0
  WHEN 'payout'              THEN amount_minor < 0
  WHEN 'adjustment'          THEN amount_minor <> 0 END),
CONSTRAINT ledger_entries_reference_check CHECK (CASE entry_type
  WHEN 'sale'                THEN shop_order_id IS NOT NULL
  WHEN 'shipping_income'     THEN shop_order_id IS NOT NULL
  WHEN 'commission'          THEN shop_order_id IS NOT NULL
  WHEN 'cod_cash_held'       THEN shop_order_id IS NOT NULL
  WHEN 'refund'              THEN shop_order_id IS NOT NULL AND refund_id IS NOT NULL
  WHEN 'commission_reversal' THEN shop_order_id IS NOT NULL AND refund_id IS NOT NULL
  WHEN 'vendor_remittance'   THEN remittance_id IS NOT NULL AND created_by IS NOT NULL
  WHEN 'payout'              THEN payout_id IS NOT NULL
  WHEN 'payout_reversal'     THEN payout_id IS NOT NULL AND reverses_entry_id IS NOT NULL
  WHEN 'tax_withholding'     THEN payout_id IS NOT NULL
  WHEN 'adjustment'          THEN created_by IS NOT NULL AND char_length(description) >= 20 END),
CONSTRAINT ledger_entries_description_check CHECK (char_length(description) BETWEEN 3 AND 500),
CONSTRAINT ledger_entries_dedupe_key_check CHECK (dedupe_key ~
  '^(delivery|refund|remittance|payout|adjustment):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(:[a-z_]+)?$')
```

- **Exactly once.** Posting functions insert with `ON CONFLICT (dedupe_key) DO NOTHING`, so a repeated delivery event, job or request cannot post twice (T-LED-005 proposed; T-PAY-005).
- **Append-only.** Privileges and the trigger of [04 §2.12](04-domain-model-and-data-dictionary.md) stop `UPDATE` and `DELETE` for every role, including the owner; a correction is a new `adjustment` or reversal entry (FR-LED-005). T-LED-002 (proposed).
- **No cross-shop entries.** Every reference is a composite FK with `shop_id`, so an entry for shop A cannot point at shop B's shop order, refund, payout or remittance, and a reversal cannot reverse another shop's entry (T-SEC-001 at the API, 23503 at the database).
- **Sign and reference per type.** The two CASE CHECKs turn the posting table of [05 §7.2](05-order-payment-and-inventory-lifecycles.md#72-entry-types-and-posting-rules) into constraints. A `commission` posted as a positive number fails with 23514 instead of paying the vendor the platform's commission. T-LED-104 (proposed).
- **`tax_withholding`** is in the value list from the baseline so that OD-27 can enable it without a migration ([05 §7.9](05-order-payment-and-inventory-lifecycles.md#79-tax_withholding-reserved-pending-od-27)).

**Indexes.**

| Index                               | Definition                                                                             | Query served                                                                                                                                                                                                                                                                                                   |
| ----------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger_entries_dedupe_key_key`     | `(dedupe_key)`                                                                         | Exactly-once insert; "does a delivery posting exist": `WHERE dedupe_key = 'delivery:' \|\| :so \|\| ':sale'`                                                                                                                                                                                                   |
| `ledger_entries_shop_statement_idx` | `(shop_id, created_at DESC, id DESC) INCLUDE (amount_minor, available_at, entry_type)` | `listShopLedgerEntries` and statements by date range; `getShopBalance` sums (`SUM(amount_minor)`, `FILTER (WHERE available_at <= now())`) as an index-only scan ([05 §7.10](05-order-payment-and-inventory-lifecycles.md#710-balances-availability-and-payable-amount))                                        |
| `ledger_entries_shop_available_idx` | `(shop_id, available_at)`                                                              | Payout eligibility: `WHERE shop_id = :s AND entry_type <> 'payout' AND available_at <= now() AND NOT EXISTS (payout_entries …)` ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11))                                                                                           |
| `ledger_entries_shop_order_idx`     | `(shop_order_id) WHERE shop_order_id IS NOT NULL`                                      | Integrity check "one delivery group per delivered shop order"; entries of an order on the admin page                                                                                                                                                                                                           |
| `ledger_entries_recent_idx`         | `(created_at DESC, id DESC)`                                                           | `adminListLedgerEntries` without `shop` (the default `/admin/ledger` view): newest first, `ORDER BY created_at DESC, id DESC LIMIT n`, with the optional `from`/`to` range on the index and the `entry_type` filter applied to the rows read. With `shop`, `ledger_entries_shop_statement_idx` serves the list |

**Lifecycle and retention.** Insert-only. A shop's balance is the sum of all its entries, so deleting old entries would change the balance. Entries are therefore kept for the life of the shop and purged, if at all, only for a closed shop with a zero balance, 7 years after its last entry ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 13.2 `payouts`

**Module** `ledger` · **Release** R1.1 (created in R0: `ledger_entries.payout_id` references it) · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial

A manual bank or wallet transfer from DripNepal to a vendor, covering a set of settled entries (FR-LED-004). Machine: [05 §6.8](05-order-payment-and-inventory-lifecycles.md#68-payout-and-settlement-r11). Gateway collection and payouts are blocked on [Open OD-02] and [Verify-external VX-01]; releases also wait for OD-27.

| Column                                                | Type        | Null | Default    | Notes                                                                                                                                                       |
| ----------------------------------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                  | uuid        | no   | `uuidv7()` |                                                                                                                                                             |
| `shop_id`                                             | uuid        | no   | App        |                                                                                                                                                             |
| `payout_account_id`                                   | uuid        | no   | App        | The verified, active payout account at creation (§6.7). Kept because the vendor may replace the account later                                               |
| `amount_minor`                                        | bigint      | no   | App        | Σ of the linked entries (§13.3)                                                                                                                             |
| `currency`                                            | char(3)     | no   | `'NPR'`    |                                                                                                                                                             |
| `status`                                              | text        | no   | `'draft'`  | `draft`, `approved`, `paid`, `failed`, `cancelled`                                                                                                          |
| `period_start`, `period_end`                          | timestamptz | no   | App        | Half-open statement period ([04 §2.2](04-domain-model-and-data-dictionary.md)): previous payout's `period_end` (or the shop's first entry) to creation time |
| `bank_reference`                                      | text        | yes  | —          | Required for `paid`                                                                                                                                         |
| `failure_reason`                                      | text        | yes  | —          | Required for `failed`                                                                                                                                       |
| `created_by`                                          | uuid        | no   | App        | Finance officer                                                                                                                                             |
| `approved_by`                                         | uuid        | yes  | —          |                                                                                                                                                             |
| `is_single_operator_approval`                         | boolean     | no   | `false`    | As `refunds`                                                                                                                                                |
| `approved_at`, `paid_at`, `failed_at`, `cancelled_at` | timestamptz | yes  | —          |                                                                                                                                                             |
| `version`                                             | int         | no   | `1`        |                                                                                                                                                             |
| `created_at`, `updated_at`                            | timestamptz | no   | `now()`    |                                                                                                                                                             |

**Keys and constraints.**

```sql
CONSTRAINT payouts_pkey PRIMARY KEY (id),
CONSTRAINT payouts_id_shop_id_key UNIQUE (id, shop_id),                   -- target for §13.1, §13.3
CONSTRAINT payouts_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT payouts_account_fkey FOREIGN KEY (payout_account_id, shop_id)
  REFERENCES shop_payout_accounts (id, shop_id) ON DELETE RESTRICT,       -- shop_payout_accounts_id_shop_id_key, §6.7
CONSTRAINT payouts_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT payouts_approved_by_fkey FOREIGN KEY (approved_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT payouts_status_check CHECK (status IN ('draft', 'approved', 'paid', 'failed', 'cancelled')),
CONSTRAINT payouts_amount_check CHECK (amount_minor > 0),
CONSTRAINT payouts_currency_check CHECK (currency = 'NPR'),
CONSTRAINT payouts_period_check CHECK (period_end > period_start),
CONSTRAINT payouts_maker_checker_check
  CHECK (approved_by IS NULL OR approved_by <> created_by OR is_single_operator_approval),
CONSTRAINT payouts_approved_check CHECK ((status IN ('approved', 'paid', 'failed'))
  = (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
CONSTRAINT payouts_paid_check
  CHECK ((status = 'paid') = (paid_at IS NOT NULL AND bank_reference IS NOT NULL)),
CONSTRAINT payouts_failed_check
  CHECK ((status = 'failed') = (failed_at IS NOT NULL AND failure_reason IS NOT NULL)),
CONSTRAINT payouts_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))

-- One payout in flight per shop [Assumption]: finance works a shop's payouts one at a time
CREATE UNIQUE INDEX payouts_one_open_per_shop_key ON payouts (shop_id) WHERE status IN ('draft', 'approved');
```

`payouts_amount_check` means no payout is created when the eligible sum is zero or negative; the vendor then still owes the platform ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)). `Σ payout_entries = amount_minor = −(its payout entry)` spans tables and is checked nightly ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)). T-LED-101 (proposed) covers the maker-checker CHECK here too. `approvePayout` also refuses with 403 `FORBIDDEN` an approver who is the `verified_by` of the payout's `payout_account_id` row (§6.7), except as a flagged single-operator approval ([07 §4.7](07-security-threat-model-and-permissions.md#47-maker-checker-and-single-operator-mode)). The rule spans two tables, so no CHECK can back it; a trigger could, but none is proposed.

**Indexes.**

| Index                           | Definition                            | Query served                                                        |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `payouts_shop_idx`              | `(shop_id, created_at DESC, id DESC)` | `listShopPayouts`                                                   |
| `payouts_admin_status_idx`      | `(status, created_at DESC, id DESC)`  | `listPayouts` filtered by status                                    |
| `payouts_one_open_per_shop_key` | above                                 | "Is a payout already in flight for this shop" before `createPayout` |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. Financial record, kept with the shop's ledger ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 13.3 `payout_entries`

**Module** `ledger` · **Release** R1.1 · **Shop scope** `shop_id`, composite FKs · **Lifecycle** Record (deletable only while the payout is a draft) · **Sensitivity** Financial

Which ledger entries a payout settles. `UNIQUE (ledger_entry_id)` makes it impossible to pay the same entry twice.

| Column                         | Type        | Null | Default | Notes                         |
| ------------------------------ | ----------- | ---- | ------- | ----------------------------- |
| `payout_id`, `ledger_entry_id` | uuid        | no   | App     | Composite primary key         |
| `shop_id`                      | uuid        | no   | App     | Carried for the composite FKs |
| `created_at`                   | timestamptz | no   | `now()` |                               |

**Keys and constraints.**

```sql
CONSTRAINT payout_entries_pkey PRIMARY KEY (payout_id, ledger_entry_id),
CONSTRAINT payout_entries_ledger_entry_key UNIQUE (ledger_entry_id),
CONSTRAINT payout_entries_payout_fkey FOREIGN KEY (payout_id, shop_id)
  REFERENCES payouts (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT payout_entries_entry_fkey FOREIGN KEY (ledger_entry_id, shop_id)
  REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT
```

```sql
-- Links may be added or removed only while the payout is a draft; a payout entry is never itself paid out
CREATE OR REPLACE FUNCTION payout_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_payout uuid;
  v_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN v_payout := OLD.payout_id; ELSE v_payout := NEW.payout_id; END IF;
  SELECT status INTO v_status FROM payouts WHERE id = v_payout FOR SHARE;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'payout_entries can change only while the payout is a draft' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'INSERT' AND EXISTS (SELECT 1 FROM ledger_entries
                                   WHERE id = NEW.ledger_entry_id AND entry_type = 'payout') THEN
    RAISE EXCEPTION 'a payout entry cannot be included in a payout' USING ERRCODE = 'P0001';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER payout_entries_guard BEFORE INSERT OR DELETE ON payout_entries
  FOR EACH ROW EXECUTE FUNCTION payout_entries_guard();
REVOKE UPDATE, TRUNCATE ON payout_entries FROM dripnepal_app;
```

The only delete in the money tables is cancelling a draft payout, which removes its links so the entries become eligible again ([05 §6.8](05-order-payment-and-inventory-lifecycles.md#68-payout-and-settlement-r11)). Once approved, links are permanent. The `FOR SHARE` lock makes the check race-free against a concurrent approval. T-LED-102 (proposed) deletes a link of an approved payout and inserts a `payout` entry into a draft, and expects P0001 both times.

**Indexes.** `payout_entries_ledger_entry_key` serves the eligibility anti-join `NOT EXISTS (SELECT 1 FROM payout_entries WHERE ledger_entry_id = e.id)`. The primary key serves "entries of this payout" on the statement.

**Lifecycle and retention.** As §13.2.

### 13.4 `vendor_remittances`

**Module** `ledger` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial; `note` Personal (no-contact-data rule, [04 §19.1](04-domain-model-and-data-dictionary.md))

Money a vendor pays DripNepal, mostly COD commission (FR-LED-004 R1 part, [05 §7.5](05-order-payment-and-inventory-lifecycles.md#75-vendor-remittance-r1)). Each row posts one `vendor_remittance` ledger entry in the same transaction. Terms with vendors are [Open OD-05].

| Column         | Type        | Null | Default    | Notes                                                                                                                   |
| -------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| `id`           | uuid        | no   | `uuidv7()` |                                                                                                                         |
| `shop_id`      | uuid        | no   | App        |                                                                                                                         |
| `amount_minor` | bigint      | no   | App        | At most what the shop owes at recording time                                                                            |
| `currency`     | char(3)     | no   | `'NPR'`    |                                                                                                                         |
| `method`       | text        | no   | App        | `bank_transfer`, `wallet`, `cash`, `other`                                                                              |
| `reference`    | text        | no   | App        | Bank or wallet reference, or receipt number for cash                                                                    |
| `received_at`  | timestamptz | no   | App        | When the money arrived, as entered by finance                                                                           |
| `recorded_by`  | uuid        | no   | App        | Finance officer                                                                                                         |
| `note`         | text        | yes  | —          | At most 500 characters. Never contact data (no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md)) |
| `created_at`   | timestamptz | no   | `now()`    |                                                                                                                         |

**Keys and constraints.**

```sql
CONSTRAINT vendor_remittances_pkey PRIMARY KEY (id),
CONSTRAINT vendor_remittances_id_shop_id_key UNIQUE (id, shop_id),                 -- target for §13.1
CONSTRAINT vendor_remittances_reference_key UNIQUE (shop_id, method, reference),   -- one transfer, one record
CONSTRAINT vendor_remittances_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT vendor_remittances_recorded_by_fkey FOREIGN KEY (recorded_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT vendor_remittances_amount_check CHECK (amount_minor > 0),
CONSTRAINT vendor_remittances_currency_check CHECK (currency = 'NPR'),
CONSTRAINT vendor_remittances_method_check CHECK (method IN ('bank_transfer', 'wallet', 'cash', 'other')),
CONSTRAINT vendor_remittances_reference_check CHECK (char_length(reference) BETWEEN 3 AND 100),
CONSTRAINT vendor_remittances_received_at_check CHECK (received_at <= created_at + interval '1 day'),
CONSTRAINT vendor_remittances_note_check CHECK (note IS NULL OR char_length(note) <= 500)
```

`vendor_remittances_reference_key` stops the same bank transfer from being recorded twice by two finance officers; the second gets 422 `VALIDATION_FAILED` on `reference` ([04 §16.5](04-domain-model-and-data-dictionary.md)). The rule "no more than the amount owed" reads the balance, so `recordVendorRemittance` locks the `shops` row `FOR UPDATE` before summing: a remittance that turned the balance positive would make DripNepal hold vendor money, which could look like stored value [Verify-external VX-01].

**Indexes.** `vendor_remittances_shop_idx (shop_id, received_at DESC)` serves the remittance history on the seller finance page and the admin shop page.

**Lifecycle and retention.** Insert-only in practice; a wrong remittance is corrected by an `adjustment` entry with reason, not by editing the row. Financial record, kept with the shop's ledger ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 13.5 `ledger_adjustment_requests` (proposed)

**Module** `ledger` · **Release** R1 (proposed) · **Shop scope** `shop_id`, composite FKs · **Lifecycle** Record · **Sensitivity** Financial; `reason` and `cancel_reason` Personal (no-contact-data rule, [04 §19.1](04-domain-model-and-data-dictionary.md))

A ledger adjustment above Rs 10,000 that waits for a second finance officer ([05 §7.8](05-order-payment-and-inventory-lifecycles.md#78-adjustments), [Assumption OD-14]). `createLedgerAdjustment` posts an adjustment with `|amount_minor|` up to `1000000` itself; above that it inserts a row here and posts nothing. The `adjustment` entry is posted only in the approval transaction, so `ledger_entries` stays append-only and never holds a pending adjustment (INV-12 in [04 §16.2](04-domain-model-and-data-dictionary.md#162-invariant-register)). The table, `approveLedgerAdjustment`, `cancelLedgerAdjustment` and the audit actions `ledger.adjust_request` and `ledger.adjust_cancel` are proposed in 05 §7.8.

| Column                               | Type        | Null | Default       | Notes                                                                                                                                                                                                               |
| ------------------------------------ | ----------- | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                 | uuid        | no   | `uuidv7()`    | The posted entry's `dedupe_key` is `adjustment:<id>`, which `ledger_entries_dedupe_key_check` already admits                                                                                                        |
| `shop_id`                            | uuid        | no   | App           | Input of `createLedgerAdjustment`                                                                                                                                                                                   |
| `amount_minor`                       | bigint      | no   | App           | Signed as on `ledger_entries` (positive means the platform owes the vendor), `\|amount_minor\|` above `1000000`; the one signed money input ([04 §18.1](04-domain-model-and-data-dictionary.md#181-representation)) |
| `currency`                           | char(3)     | no   | `'NPR'`       |                                                                                                                                                                                                                     |
| `reason`                             | text        | no   | App           | 20–500 characters (AC-FR-LED-005-1); becomes the entry's `description`. Never contact data (no-contact-data rule of [04 §19.1](04-domain-model-and-data-dictionary.md))                                             |
| `reverses_entry_id`, `shop_order_id` | uuid        | yes  | —             | Optional references, copied to the entry; both must belong to `shop_id`                                                                                                                                             |
| `status`                             | text        | no   | `'requested'` | `requested`, `approved`, `cancelled`                                                                                                                                                                                |
| `created_by`                         | uuid        | no   | App           | The requesting finance officer; becomes the entry's `created_by`                                                                                                                                                    |
| `approved_by`                        | uuid        | yes  | —             | The second approver                                                                                                                                                                                                 |
| `is_single_operator_approval`        | boolean     | no   | `false`       | As `refunds`                                                                                                                                                                                                        |
| `approved_at`, `cancelled_at`        | timestamptz | yes  | —             |                                                                                                                                                                                                                     |
| `cancel_reason`                      | text        | yes  | —             | Required for `cancelled`; 3–500 characters                                                                                                                                                                          |
| `ledger_entry_id`                    | uuid        | yes  | —             | The posted `adjustment` entry, set in the approval transaction                                                                                                                                                      |
| `version`                            | int         | no   | `1`           |                                                                                                                                                                                                                     |
| `created_at`, `updated_at`           | timestamptz | no   | `now()`       |                                                                                                                                                                                                                     |

**Keys and constraints.**

```sql
CONSTRAINT ledger_adjustment_requests_pkey PRIMARY KEY (id),
CONSTRAINT ledger_adjustment_requests_ledger_entry_key UNIQUE (ledger_entry_id),
CONSTRAINT ledger_adjustment_requests_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_shop_order_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_reverses_fkey FOREIGN KEY (reverses_entry_id, shop_id)
  REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_entry_fkey FOREIGN KEY (ledger_entry_id, shop_id)
  REFERENCES ledger_entries (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_created_by_fkey FOREIGN KEY (created_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_approved_by_fkey FOREIGN KEY (approved_by)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT ledger_adjustment_requests_status_check CHECK (status IN ('requested', 'approved', 'cancelled')),
CONSTRAINT ledger_adjustment_requests_amount_check CHECK (amount_minor > 1000000 OR amount_minor < -1000000),
CONSTRAINT ledger_adjustment_requests_currency_check CHECK (currency = 'NPR'),
CONSTRAINT ledger_adjustment_requests_reason_check CHECK (char_length(reason) BETWEEN 20 AND 500),
CONSTRAINT ledger_adjustment_requests_maker_checker_check
  CHECK (approved_by IS NULL OR approved_by <> created_by OR is_single_operator_approval),
CONSTRAINT ledger_adjustment_requests_approved_check CHECK ((status = 'approved') = (approved_at IS NOT NULL)
  AND (approved_at IS NULL) = (approved_by IS NULL)
  AND (approved_at IS NULL) = (ledger_entry_id IS NULL)),
CONSTRAINT ledger_adjustment_requests_cancelled_check CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL)
  AND (cancelled_at IS NULL) = (cancel_reason IS NULL)),
CONSTRAINT ledger_adjustment_requests_cancel_reason_check
  CHECK (cancel_reason IS NULL OR char_length(cancel_reason) BETWEEN 3 AND 500)
```

- **Maker-checker.** `ledger_adjustment_requests_maker_checker_check` is the rule of `refunds_maker_checker_check` (§12.4). `created_by` is never null here, so the `created_by IS NULL` branch of the `refunds` form can never apply and is left out, which leaves the form of `payouts_maker_checker_check`. `approveLedgerAdjustment` compares the actor with `created_by` after locking the row and refuses a self-approval with 403 `FORBIDDEN` outside `single_operator_mode` ([07 §4.7](07-security-threat-model-and-permissions.md#47-maker-checker-and-single-operator-mode)). The CHECK (23514) is a backstop only: it stays off the [06 §5.3](06-api-design.md#53-domain-errors-to-http) allowlist, so a hit is 500 `INTERNAL` and an alert ([04 §16.5](04-domain-model-and-data-dictionary.md#165-when-a-backstop-fires)). T-LED-101 (proposed) covers it too.
- **Posting at approval.** One transaction locks the request row `FOR UPDATE` and checks `status = 'requested'`, inserts the `adjustment` entry (`dedupe_key = adjustment:<id>`, `created_by` = the requester, `description` = `reason`, and the request's `amount_minor`, `reverses_entry_id` and `shop_order_id`), then sets `status`, `approved_by`, `approved_at` and `ledger_entry_id` in one compare-and-set `UPDATE … WHERE id = :id AND status = 'requested'`, and writes `ledger.adjust`. The entry goes first because `ledger_adjustment_requests_approved_check` requires `ledger_entry_id` with `approved`. A second approval finds the row no longer `requested` and posts nothing, and the dedupe key would stop a second posting in any case (INV-14). T-LED-103 (proposed) also approves a request and expects exactly one entry, and expects none while the request is `requested` or after it is `cancelled`.
- **Cancellation.** Either officer may cancel a `requested` row with a reason; nothing is posted.
- `ledger_adjustment_requests_amount_check` keeps adjustments up to Rs 10,000 out, because `createLedgerAdjustment` posts those itself. It is a backstop behind that routing and the validator of [04 §18.1](04-domain-model-and-data-dictionary.md#181-representation), so a hit is 500 `INTERNAL`, as for the maker-checker CHECK.

**Indexes.**

| Index                                         | Definition                                | Query served                                                                        |
| --------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------- |
| `ledger_adjustment_requests_open_idx`         | `(created_at) WHERE status = 'requested'` | Requests awaiting a second approval, oldest first, on the admin ledger page         |
| `ledger_adjustment_requests_ledger_entry_key` | UNIQUE `(ledger_entry_id)`                | One request per posted entry; the request behind an `adjustment` entry on that page |

**Lifecycle and retention.** Status by compare-and-set (`requested → approved | cancelled`). Never deleted. Financial record, kept with the shop's ledger ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

---

## 14. Support and notifications

### 14.1 `support_cases`

**Module** `platform` (canon §6.2) · **Release** R1 · **Shop scope** `shop_id` when a shop is involved · **Lifecycle** Record · **Sensitivity** Personal

The grievance and support register required by E-Commerce Act 2081 s33: a complaint is registered and acknowledged at once, decided within 15 days and answered in writing, through an online mechanism (FR-ADM-009) [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; obligations Verify-external VX-02]. Cases are also opened automatically by the system, for example after a second failed delivery or a disputed COD collection ([05 §6.3, §6.5](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment)).

| Column                                 | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                   | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `number`                               | text        | no   | App        | `SC-` + 7 Crockford base32, shown to the customer at once (AC-FR-ADM-009-1)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `opened_by_user_id`                    | uuid        | yes  | —          | Customer, or staff member recording a phone or email complaint from an account holder (below); null when the system opened it                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `customer_user_id`                     | uuid        | yes  | —          | The customer the case concerns; null only for cases not about a customer (for example a vendor dispute)                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `order_id`, `shop_order_id`, `shop_id` | uuid        | yes  | —          | What the case is about                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `category`                             | text        | no   | App        | `order_issue`, `return_request`, `refund`, `delivery`, `product_complaint`, `account`, `other`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `status`                               | text        | no   | `'open'`   | `open`, `awaiting_customer`, `awaiting_shop`, `resolved`, `closed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `subject`                              | text        | no   | App        | 3–150 characters, for lists                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `due_at`                               | timestamptz | no   | App        | Set by every action that opens a case (customer, staff or system) from the same `DateTime` as `created_at`: `c.createdAt = DateTime.now()`, then `c.dueAt = c.createdAt.plus({ days: 15 })`, so it is exactly 15 days (s33) and is on the model for the 201 response without a `refresh()`. A database default of `now() + interval '15 days'` would use the database clock while a model insert sends `created_at` from the application clock, and `support_cases_due_check` would then reject valid inserts ([04 §2.15](04-domain-model-and-data-dictionary.md)) |
| `resolution_summary`                   | text        | yes  | —          | Required to resolve; the customer sees it. If unresolved, it gives the reasons and the DoCSCP escalation route (AC-FR-ADM-009-3)                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `assigned_to_user_id`                  | uuid        | yes  | —          | Support agent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `resolved_at`, `closed_at`             | timestamptz | yes  | —          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `version`                              | int         | no   | `1`        |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `created_at`, `updated_at`             | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**Keys and constraints.**

```sql
CONSTRAINT support_cases_pkey PRIMARY KEY (id),
CONSTRAINT support_cases_number_key UNIQUE (number),
CONSTRAINT support_cases_id_customer_user_id_key UNIQUE (id, customer_user_id),   -- target for §11.7
CONSTRAINT support_cases_number_check CHECK (number ~ '^SC-[0-9A-HJKMNP-TV-Z]{7}$'),
CONSTRAINT support_cases_opened_by_fkey FOREIGN KEY (opened_by_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT support_cases_customer_fkey FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT support_cases_order_customer_fkey FOREIGN KEY (order_id, customer_user_id)
  REFERENCES orders (id, customer_user_id) ON DELETE RESTRICT,
CONSTRAINT support_cases_shop_order_fkey FOREIGN KEY (shop_order_id, order_id)
  REFERENCES shop_orders (id, order_id) ON DELETE RESTRICT,
CONSTRAINT support_cases_shop_order_shop_fkey FOREIGN KEY (shop_order_id, shop_id)
  REFERENCES shop_orders (id, shop_id) ON DELETE RESTRICT,
CONSTRAINT support_cases_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT support_cases_assignee_fkey FOREIGN KEY (assigned_to_user_id)
  REFERENCES platform_staff (user_id) ON DELETE RESTRICT,
CONSTRAINT support_cases_category_check CHECK (category IN ('order_issue', 'return_request', 'refund',
  'delivery', 'product_complaint', 'account', 'other')),
CONSTRAINT support_cases_status_check
  CHECK (status IN ('open', 'awaiting_customer', 'awaiting_shop', 'resolved', 'closed')),
CONSTRAINT support_cases_links_check CHECK ((order_id IS NULL OR customer_user_id IS NOT NULL)
  AND (shop_order_id IS NULL OR (order_id IS NOT NULL AND shop_id IS NOT NULL))),
CONSTRAINT support_cases_due_check CHECK (due_at <= created_at + interval '15 days'),
CONSTRAINT support_cases_resolution_check CHECK (status NOT IN ('resolved', 'closed')
  OR (resolution_summary IS NOT NULL AND resolved_at IS NOT NULL)),
CONSTRAINT support_cases_closed_check CHECK ((status = 'closed') = (closed_at IS NOT NULL)),
CONSTRAINT support_cases_text_check CHECK (char_length(subject) BETWEEN 3 AND 150
  AND char_length(coalesce(resolution_summary, '')) <= 5000)
```

- `support_cases_order_customer_fkey` stops a case from linking customer X to customer Y's order, so a staff mistake cannot show Y's order in X's case list.
- **Access.** Customer queries include `customer_user_id = :auth_user`, and a customer reads only `customer`-visible messages (§14.2). Another customer's case, and another customer's `order_number` or `shop_order_number` sent to `openSupportCase`, answer 404 and create nothing ([07 §4.6](07-security-threat-model-and-permissions.md#46-resource-ownership-rules-customers)). T-SEC-006 (proposed) covers these cases; T-SEC-002 covers orders only.
- **Account holders only in R1** [Assumption: needs a legal check]. A staff member who records a phone or email complaint opens the case for the complainant's account. A complaint from a person without an account, such as a brand owner or a visitor who writes to the grievance officer, is handled by the grievance officer by email outside the system, so the table has no complainant name or contact columns.
- `support_cases_due_check` allows a shorter internal target but never a deadline beyond the statutory 15 days, so the deadline cannot be quietly extended. T-ADM-103 (proposed) checks this and the written-resolution rule, and opens a case through the model right after `BEGIN` and asserts `due_at = created_at + interval '15 days'` exactly.

**Indexes.**

| Index                                   | Definition                                                                                                   | Query served                                                                                                                                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_cases_number_key`              | `(number)`                                                                                                   | `getMySupportCase` (with `customer_user_id = :u`), `adminGetSupportCase`                                                                                                                             |
| `support_cases_id_customer_user_id_key` | `(id, customer_user_id)`                                                                                     | Foreign-key target only (`return_requests_case_fkey`, §11.7)                                                                                                                                         |
| `support_cases_customer_idx`            | `(customer_user_id, created_at DESC, id DESC) WHERE customer_user_id IS NOT NULL`                            | `listMySupportCases`                                                                                                                                                                                 |
| `support_cases_shop_idx`                | `(shop_id, created_at DESC, id DESC) WHERE shop_id IS NOT NULL`                                              | `listShopSupportCases`                                                                                                                                                                               |
| `support_cases_open_due_idx`            | `(due_at) WHERE status IN ('open','awaiting_customer','awaiting_shop')`                                      | Admin register sorted by due date; the `platform.support_case_sla` job ([03 §9](03-system-architecture.md#9-asynchronous-work)) warns at `due_at − 3 days` and alerts when overdue (AC-FR-ADM-009-2) |
| `support_cases_open_shop_order_idx`     | `(shop_order_id) WHERE shop_order_id IS NOT NULL AND status IN ('open','awaiting_customer','awaiting_shop')` | Payout "held" check for an open `order_issue` case ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)); case list on the admin order page                           |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. E-Commerce Directive 2082 s14 requires consumer complaints and their hearing to be kept at least five years [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/ecommerce-directives_8errkt4.pdf>]; DripNepal keeps them 7 years after `resolved_at` ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]); the retention command then sets `subject` to the fixed placeholder `'Redacted'` (it is `NOT NULL`, 3–150 characters), keeps category, dates and `resolution_summary`, and redacts the message bodies (§14.2).

### 14.2 `support_case_messages`

**Module** `platform` · **Release** R1 · **Shop scope** through the case · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal

The written thread of a case. Answers "in writing" (s33) are the `customer`-visible messages plus the resolution summary.

| Column           | Type        | Null | Default    | Notes                                                          |
| ---------------- | ----------- | ---- | ---------- | -------------------------------------------------------------- |
| `id`             | uuid        | no   | `uuidv7()` |                                                                |
| `case_id`        | uuid        | no   | App        |                                                                |
| `author_type`    | text        | no   | App        | `customer`, `shop_member`, `platform_staff`, `system`          |
| `author_user_id` | uuid        | yes  | —          | Null for system messages such as the automatic acknowledgement |
| `visibility`     | text        | no   | App        | `customer`, `shop`, `internal`                                 |
| `body`           | text        | no   | App        | 1–5,000 characters, NFC-normalised                             |
| `created_at`     | timestamptz | no   | `now()`    |                                                                |

Who sees what (AC-FR-ADM-009-4): the customer sees `customer` messages. Shop members see only `shop` messages of cases whose `shop_id` is their shop. Staff see all and relay between the parties, so a customer's words reach the shop only as staff choose to relay them [Assumption; [07](07-security-threat-model-and-permissions.md) owns the rule].

**Keys and constraints.**

```sql
CONSTRAINT support_case_messages_pkey PRIMARY KEY (id),
CONSTRAINT support_case_messages_case_fkey FOREIGN KEY (case_id)
  REFERENCES support_cases (id) ON DELETE RESTRICT,
CONSTRAINT support_case_messages_author_fkey FOREIGN KEY (author_user_id)
  REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT support_case_messages_author_type_check
  CHECK (author_type IN ('customer', 'shop_member', 'platform_staff', 'system')
  AND (author_type = 'system') = (author_user_id IS NULL)),
CONSTRAINT support_case_messages_visibility_check CHECK (visibility IN ('customer', 'shop', 'internal')),
CONSTRAINT support_case_messages_author_visibility_check CHECK (
      (author_type <> 'customer'    OR visibility = 'customer')
  AND (author_type <> 'shop_member' OR visibility = 'shop')),
CONSTRAINT support_case_messages_body_check CHECK (char_length(body) BETWEEN 1 AND 5000)
```

`support_case_messages_author_visibility_check` keeps a customer from posting an internal note and a shop member from posting to the customer channel, whatever the request body says.

**Indexes.** `support_case_messages_case_idx (case_id, created_at, id)` serves the thread: `WHERE case_id = :c AND visibility = ANY(:allowed) ORDER BY created_at, id`.

**Lifecycle and retention.** Insert-only. Retained with the case (§14.1); at the end of its period the retention command sets `body` to a fixed placeholder such as `'Redacted'` (which `support_case_messages_body_check` accepts) with an `UPDATE` that changes only that column, the one `UPDATE` the retention exemption of `forbid_mutation()` allows (proposed, [04 §2.12](04-domain-model-and-data-dictionary.md), [07 §4.10](07-security-threat-model-and-permissions.md#410-database-roles-and-grants)). Attachments are R2.

### 14.3 `notification_deliveries`

**Module** `notifications` · **Release** R1 (email); SMS in R2 · **Shop scope** none (`shop_id` identifies a shop recipient) · **Lifecycle** Ephemeral (kept 12 months) · **Sensitivity** Personal

One row per message per recipient, created by `notifications.dispatch` and sent by one `notifications.send_email` job per row ([03 §9](03-system-architecture.md#9-asynchronous-work)). The unique `dedupe_key` makes a replayed event send nothing new. The body is not stored: it is re-rendered from the event and template, so personal data is not kept twice.

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                                                                                                                                                                             |
| `dedupe_key`               | text        | no   | App        | `<event id>:<template>:<recipient id>`                                                                                                                                                                                                                                                                                                                      |
| `channel`                  | text        | no   | `'email'`  | `email`; `sms` is added in R2 by swapping the CHECK ([04 §2.4](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                                     |
| `template`                 | text        | no   | App        | For example `order.placed.customer`, `shop_order.placed.shop`                                                                                                                                                                                                                                                                                               |
| `recipient_user_id`        | uuid        | yes  | —          | A user recipient                                                                                                                                                                                                                                                                                                                                            |
| `shop_id`                  | uuid        | yes  | —          | A shop's contact address as recipient                                                                                                                                                                                                                                                                                                                       |
| `to_address_hash`          | bytea       | yes  | App        | Keyed HMAC-SHA256 of the normalised address under `HMAC_KEY_NOTIFY_ADDRESS` (name proposed, [07 §5.5](07-security-threat-model-and-permissions.md#55-encryption)); lets support confirm "sent to this address" without storing it. Always set on insert; null only after the recipient's anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)) |
| `status`                   | text        | no   | `'queued'` | `queued`, `sent`, `failed`                                                                                                                                                                                                                                                                                                                                  |
| `attempts`                 | int         | no   | `0`        |                                                                                                                                                                                                                                                                                                                                                             |
| `provider_message_id`      | text        | yes  | —          | From the email provider (OD-08)                                                                                                                                                                                                                                                                                                                             |
| `last_error`               | text        | yes  | —          | At most 1,000 characters, with addresses redacted                                                                                                                                                                                                                                                                                                           |
| `sent_at`                  | timestamptz | yes  | —          |                                                                                                                                                                                                                                                                                                                                                             |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                                                                                                                                                                                                             |

**Keys and constraints.**

```sql
CONSTRAINT notification_deliveries_pkey PRIMARY KEY (id),
CONSTRAINT notification_deliveries_dedupe_key_key UNIQUE (dedupe_key),
CONSTRAINT notification_deliveries_recipient_fkey FOREIGN KEY (recipient_user_id)
  REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT notification_deliveries_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email')),
CONSTRAINT notification_deliveries_template_check CHECK (template ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
CONSTRAINT notification_deliveries_status_check CHECK (status IN ('queued', 'sent', 'failed')),
CONSTRAINT notification_deliveries_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
CONSTRAINT notification_deliveries_hash_check CHECK (to_address_hash IS NULL OR octet_length(to_address_hash) = 32),
CONSTRAINT notification_deliveries_dedupe_key_check CHECK (char_length(dedupe_key) BETWEEN 10 AND 200)
```

Marketing messages are checked against `users.marketing_email_consent_at` at send time (AC-FR-IAM-013-3, REG-26; Advertisement (Regulation) Act 2076 s10(1) [Verified-doc <https://lawcommission.gov.np/content/13398/ad--regulation--act-act--2076/>]; obligations [Verify-external VX-03]). A skipped message is recorded as `failed` with `last_error = 'no_consent'`, so the skip is visible. `failed` is reserved for such permanent outcomes, and for an address the provider rejects as invalid; a `failed` row is never sent again, not even by a redrive. A transport error (connection refused, timeout, a temporary SMTP or provider error) never sets `failed`: `notifications.send_email` records only `attempts` and `last_error` and the row stays `queued`, so a redriven job's `queued → sent` compare-and-set still matches after the last retry ([05 §8.14](05-order-payment-and-inventory-lifecycles.md#814-email-outage)). T-NOT-101 (proposed) replays one event three times and expects one row and one sent email.

**Indexes.**

| Index                                    | Definition                                                                 | Query served                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `notification_deliveries_dedupe_key_key` | `(dedupe_key)`                                                             | `INSERT … ON CONFLICT (dedupe_key) DO NOTHING` in dispatch                                                                                                 |
| `notification_deliveries_recipient_idx`  | `(recipient_user_id, created_at DESC) WHERE recipient_user_id IS NOT NULL` | Support: "did the customer get the order email?"                                                                                                           |
| `notification_deliveries_unsent_idx`     | `(created_at) WHERE status IN ('queued','failed')`                         | Monitoring: the `queued` backlog during an email outage and permanent failures ([05 §8.14](05-order-payment-and-inventory-lifecycles.md#814-email-outage)) |

**Lifecycle and retention.** `queued → sent | failed`, `failed` only for a permanent outcome (above). Kept 12 months, then deleted by `platform.retention_purge` (proposed) [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)]. The records the law requires (complaint acknowledgements and answers) live in §14.1 and §14.2, not here.

---

## 15. Platform and audit

### 15.1 `platform_settings`

**Module** `platform` · **Release** R1 · **Shop scope** none · **Lifecycle** Configuration · **Sensitivity** Internal (`platform_legal_disclosures` is Public)

Business values that operators change at runtime without a deploy. Values that move money or deadlines (commission rate, COD limits, SLA hours) are read inside the transaction that uses them and copied onto the row they affect ([03 §12.6](03-system-architecture.md#126-configuration-and-secrets)), so a change never moves an existing deadline or amount. Other reads may be cached for at most 60 seconds (AC-FR-CHK-007-3).

| Column                     | Type        | Null | Default | Notes                                  |
| -------------------------- | ----------- | ---- | ------- | -------------------------------------- |
| `key`                      | text        | no   | App     | Primary key; closed list below         |
| `value`                    | jsonb       | no   | App     | A JSON scalar or object, typed per key |
| `updated_by`               | uuid        | yes  | —       | Null for seeded values                 |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                        |

**Every key.** All are edited only by `platform_admin` through `updatePlatformSetting` (`platform.settings.manage`), and every change writes an `audit_logs` row with the old and new value (AC-FR-ADM-011-2). "Decision owner" is who decides the value.

| Key                                | Type            | Seeded default                     | Allowed range                                     | Decision owner                 | Source                                                                                                                           |
| ---------------------------------- | --------------- | ---------------------------------- | ------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `checkout_enabled`                 | boolean         | `true`                             | `true`, `false`                                   | Platform admin (incident lead) | Kill switch, FR-ADM-010; Directive 2082 s8(2) requires stopping transactions after a breach [Verify-external VX-02]              |
| `maintenance_banner`               | string          | `""`                               | ≤ 280 characters; empty means none                | Platform admin                 | FR-ADM-010. Shown automatically while checkout is disabled                                                                       |
| `default_commission_rate_bp`       | integer         | `1000` (10%)                       | 0–5,000                                           | Product owner                  | [Open OD-04]; placeholder until decided, must be confirmed before M7                                                             |
| `cod_max_order_value_minor`        | integer (paisa) | `2000000` (Rs 20,000)              | 100,000–2,500,000                                 | Product owner                  | [Assumption A-08; Open OD-18]. The cap stays below the Rs 25,000 cash-transaction limit [Verify-external VX-05]                  |
| `cod_max_open_orders_per_customer` | integer         | `3`                                | 1–5                                               | Product owner                  | [Assumption A-08; OD-18]                                                                                                         |
| `cod_max_refusals`                 | integer         | `2`                                | 1–10                                              | Product owner                  | Proposed repeat-refuser rule [Assumption; OD-18]; used only if OD-18 adopts it                                                   |
| `cod_refusal_window_days`          | integer         | `90`                               | 30–365                                            | Product owner                  | As above                                                                                                                         |
| `vendor_acceptance_sla_hours`      | integer         | `48`                               | 12–120                                            | Product owner                  | [Assumption A-07; OD-19]                                                                                                         |
| `return_window_days`               | integer         | `7`                                | 7–30, and ≤ `ledger_hold_days`                    | Product owner + legal          | [Assumption A-05; OD-06]. Not below 7: CPA 2075 s14 [Verify-external VX-04]. The cross-key rule is checked on either key (below) |
| `ledger_hold_days`                 | integer         | `7`                                | 7–60, and ≥ `return_window_days`                  | Product owner                  | [Assumption A-06; OD-06]. The cross-key rule is checked on either key (below); the floor of 7 is the lowest `return_window_days` |
| `reservation_ttl_minutes`          | integer         | `30`                               | 10–60                                             | Tech lead                      | [Assumption A-09]; eSewa hold and fallback when a provider returns no expiry                                                     |
| `max_shops_per_owner`              | integer         | `3`                                | 1–10                                              | Product owner                  | [Assumption A-21]                                                                                                                |
| `single_operator_mode`             | boolean         | `false`                            | `true`, `false`                                   | Product owner                  | [Assumption A-20; Open OD-14]. `false` is the safe default: maker-checker applies until someone deliberately switches it on      |
| `platform_legal_disclosures`       | object          | every string `""`, every list `[]` | Shape below; every string non-empty before launch | Product owner + legal          | FR-ADM-011; E-Commerce Act 2081 s4(2) [Verify-external VX-02]                                                                    |

`platform_legal_disclosures` shape, one field per item of REG-02 in [01](01-product-requirements.md) (E-Commerce Act 2081 s4(2)): `{platform_name, business_name, business_address, registering_authority, registration_number, registered_office_address, head_office_address, branches: [{name, address}], special_licences: [{name, number, issuer}], entity_type, pan_vat_number, contact_email, contact_phone, customer_service: {email, phone, hours}, grievance_officer: {name, email, phone, postal_address}, docscp_listing_number}`. `entity_type` says whether DripNepal is an intermediary or a list-based entity; a head office at the registered office repeats that address. It feeds the footer page and `/grievance` (AC-FR-ADM-009-5). The seeded default has every string `""`, both lists `[]` and the nested objects with `""` members. Before launch every string must be non-empty; `branches` and `special_licences` may stay empty lists, because the law asks only for any branches and any special licence. The platform admin fills the values in step 8 of the first-deploy checklist ([09 §9.3](09-code-structure-and-engineering-standards.md#93-bootstrap-checklist-first-deploy-of-an-environment)), and the R1 launch gate needs the page complete ([01 §5.3](01-product-requirements.md#53-r1-launch-gates) G3 and G4; the M7 row of [risks-and-open-decisions.md §5](risks-and-open-decisions.md#5-decisions-that-block-implementation-by-milestone)). s4(3) requires changes to be published within 48 hours [Verify-external VX-02], and the audit row evidences when a change was made.

**Keys and constraints.**

```sql
CREATE OR REPLACE FUNCTION jsonb_int_between(v jsonb, lo bigint, hi bigint) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN jsonb_typeof(v) = 'number' AND (v #>> '{}') ~ '^[0-9]{1,18}$'
              THEN (v #>> '{}')::bigint BETWEEN lo AND hi ELSE false END
$$;

CONSTRAINT platform_settings_pkey PRIMARY KEY (key),
CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT platform_settings_value_check CHECK (CASE key
  WHEN 'checkout_enabled'                 THEN jsonb_typeof(value) = 'boolean'
  WHEN 'single_operator_mode'             THEN jsonb_typeof(value) = 'boolean'
  WHEN 'maintenance_banner'               THEN jsonb_typeof(value) = 'string'
                                               AND char_length(value #>> '{}') <= 280
  WHEN 'platform_legal_disclosures'       THEN jsonb_typeof(value) = 'object'
  WHEN 'default_commission_rate_bp'       THEN jsonb_int_between(value, 0, 5000)
  WHEN 'cod_max_order_value_minor'        THEN jsonb_int_between(value, 100000, 2500000)
  WHEN 'cod_max_open_orders_per_customer' THEN jsonb_int_between(value, 1, 5)
  WHEN 'cod_max_refusals'                 THEN jsonb_int_between(value, 1, 10)
  WHEN 'cod_refusal_window_days'          THEN jsonb_int_between(value, 30, 365)
  WHEN 'vendor_acceptance_sla_hours'      THEN jsonb_int_between(value, 12, 120)
  WHEN 'return_window_days'               THEN jsonb_int_between(value, 7, 30)
  WHEN 'ledger_hold_days'                 THEN jsonb_int_between(value, 7, 60)
  WHEN 'reservation_ttl_minutes'          THEN jsonb_int_between(value, 10, 60)
  WHEN 'max_shops_per_owner'              THEN jsonb_int_between(value, 1, 10)
  ELSE false END)                                               -- unknown keys are rejected
```

This is the one `jsonb` column that holds scalars, an exception to the object-only rule of [04 §2.11](04-domain-model-and-data-dictionary.md): a setting is one typed value, and the per-key CHECK is stricter than an object wrapper would be. Adding a key needs a migration that replaces the CHECK. That is deliberate, because a key the code does not know about is a bug. Ranges are sanity bounds [Assumption], not business decisions; the decision is the value. The TypeScript registry of keys in `app/modules/platform/domain/settings.ts` is compared with this CHECK by T-ADM-102 (proposed), which also writes an out-of-range value and expects 23514 mapped to 422.

**Cross-key rule.** `ledger_hold_days ≥ return_window_days` keeps vendor credits waiting until the return window has closed (A-06, AC-FR-LED-002-2). A CHECK sees one row, so `updatePlatformSetting` enforces the rule for a change of either key: it locks both rows (`SELECT … FROM platform_settings WHERE key IN ('ledger_hold_days', 'return_window_days') ORDER BY key FOR UPDATE`), then answers 422 `VALIDATION_FAILED` when the resulting `ledger_hold_days` is below `return_window_days`. Locking both rows serializes two admins who change the two keys at the same moment, each of whom would otherwise validate against the other's old value. T-ADM-102 (proposed) also raises `return_window_days` above the hold and expects 422, and runs a concurrent update of the two keys that must leave the rule holding.

**Indexes.** Primary key only (14 rows).

**Lifecycle and retention.** Seeded by the reference seeder ([04 §20.3](04-domain-model-and-data-dictionary.md)); the platform admin fills in the legal disclosures before launch. Updated in place; the history is in `audit_logs`. Never deleted.

### 15.2 `idempotency_keys`

**Module** `platform` · **Release** R1 · **Shop scope** none (scoped by actor) · **Lifecycle** Ephemeral · **Sensitivity** Personal (stored responses contain order data)

The stored outcome of an operation called with an `Idempotency-Key` (⚷). The contract is canon §6.6 and [06](06-api-design.md); how `placeOrder` uses it is [05 §4.6](05-order-payment-and-inventory-lifecycles.md#46-idempotency-handling). The row is inserted as the first statement of the business transaction, so it becomes visible only when the operation commits.

| Column                         | Type        | Null | Default       | Notes                                                                                                                                                           |
| ------------------------------ | ----------- | ---- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                           | uuid        | no   | `uuidv7()`    | Referenced by `orders.idempotency_key_id` and by adjustment movements (§8.3)                                                                                    |
| `actor_scope`                  | text        | no   | App           | User id, `provider:<name>` for webhooks, or `system`                                                                                                            |
| `operation`                    | text        | no   | App           | The operationId, for example `placeOrder`                                                                                                                       |
| `key`                          | text        | no   | App           | Client-generated, 16–64 characters                                                                                                                              |
| `fingerprint`                  | bytea       | no   | App           | SHA-256 of method, route pattern, resolved path parameters and canonical JSON body                                                                              |
| `status`                       | text        | no   | `'completed'` | Always `completed` in R1, because the row commits with the operation. The column exists for a future non-transactional operation that must record `in_progress` |
| `response_status`              | smallint    | no   | App           | HTTP status to replay                                                                                                                                           |
| `response_body`                | jsonb       | no   | App           | Transformed response body; never secrets, and never a payment redirect ([05 §4.6](05-order-payment-and-inventory-lifecycles.md#46-idempotency-handling))        |
| `resource_type`, `resource_id` | text, uuid  | yes  | —             | What was created, for support                                                                                                                                   |
| `created_at`                   | timestamptz | no   | `now()`       |                                                                                                                                                                 |
| `expires_at`                   | timestamptz | no   | App           | `created_at` + 24 h, or + 72 h for `placeOrder` [Assumption A-32]                                                                                               |

**Keys and constraints.**

```sql
CONSTRAINT idempotency_keys_pkey PRIMARY KEY (id),
CONSTRAINT idempotency_keys_scope_key UNIQUE (actor_scope, operation, key),
CONSTRAINT idempotency_keys_actor_scope_check CHECK (actor_scope ~
  '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|provider:[a-z]+|system)$'),
CONSTRAINT idempotency_keys_operation_check CHECK (operation ~ '^[a-z][A-Za-z0-9]{2,60}$'),
CONSTRAINT idempotency_keys_key_check CHECK (key ~ '^[A-Za-z0-9_-]{16,64}$'),
CONSTRAINT idempotency_keys_fingerprint_check CHECK (octet_length(fingerprint) = 32),
CONSTRAINT idempotency_keys_status_check CHECK (status IN ('completed')),
CONSTRAINT idempotency_keys_response_check
  CHECK (response_status BETWEEN 200 AND 599 AND jsonb_typeof(response_body) = 'object'),
CONSTRAINT idempotency_keys_expiry_check
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '72 hours')
```

`idempotency_keys_scope_key` is what makes a concurrent duplicate wait for the first request and then replay its response (T-CHK-004). There are no foreign keys: `actor_scope` holds a user id, a provider or `system`, and keys must be purgeable independently of anything they describe.

**Indexes.**

| Index                         | Definition                      | Query served                                                                                        |
| ----------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `idempotency_keys_scope_key`  | `(actor_scope, operation, key)` | Insert-or-replay at the start of every ⚷ operation                                                  |
| `idempotency_keys_expiry_idx` | `(expires_at)`                  | `platform.purge_idempotency_keys` (hourly): `DELETE … WHERE expires_at < now()` in batches of 1,000 |

**Lifecycle and retention.** Hard-deleted after `expires_at` ([04 §2.6](04-domain-model-and-data-dictionary.md)). The purge sets `orders.idempotency_key_id` to null through `ON DELETE SET NULL`, served by `orders_idempotency_key_key` (§11.1).

### 15.3 `audit_logs`

**Module** `audit` · **Release** R1 (M0) · **Shop scope** `shop_id` when the action is inside a shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal, Internal

Who did what, to what, when, from where and why: one row per state change made by a shop member or staff member, in the same transaction (AC-J00-09), plus authentication events and system actions that move money. It is the accountability record behind FR-ADM-003, the maker-checker flags and financial corrections.

| Column          | Type        | Null | Default  | Notes                                                                                                                                                                    |
| --------------- | ----------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | bigint      | no   | identity | `GENERATED ALWAYS AS IDENTITY` ([04 §2.1](04-domain-model-and-data-dictionary.md))                                                                                       |
| `occurred_at`   | timestamptz | no   | `now()`  | Transaction time                                                                                                                                                         |
| `actor_type`    | text        | no   | App      | `customer`, `shop_member`, `platform_staff`, `system`, `provider`                                                                                                        |
| `actor_user_id` | uuid        | yes  | —        | No FK (below)                                                                                                                                                            |
| `actor_role`    | text        | yes  | —        | Role at the time: `platform:finance_officer`, `shop:<shop_id>:manager`, `shop:<shop_id>:owner`                                                                           |
| `action`        | text        | no   | App      | `<subject>.<verb>`: `shop.suspend`, `refund.approve`, `ledger.adjust`, `platform_setting.update`, `auth.login_failed`, `auth.reauth_failed` (proposed)                   |
| `subject_type`  | text        | no   | App      | `order`, `shop_order`, `refund`, `payout`, `shop`, `user`, `platform_setting`, `email_hash`, …                                                                           |
| `subject_id`    | text        | no   | App      | The subject's id as text: a UUID, a setting key, or the 64-character email hash of an authentication event without an account (below)                                    |
| `shop_id`       | uuid        | yes  | —        | No FK (below)                                                                                                                                                            |
| `request_id`    | text        | yes  | —        | Links to logs and the problem body                                                                                                                                       |
| `ip_hash`       | bytea       | yes  | —        | Keyed HMAC-SHA256 of the client IP; correlates abuse without storing addresses                                                                                           |
| `changes`       | jsonb       | no   | `'{}'`   | Before and after values of columns that hold no personal data; a personal column by name only (No personal values, below); flags such as `{"flags":["single_operator"]}` |
| `reason`        | text        | yes  | —        | Mandatory for suspensions, adjustments, manual resolutions; at most 2,000 characters                                                                                     |

There are no foreign keys, matching [04 §4.5](04-domain-model-and-data-dictionary.md): the audit trail must survive whatever happens to the rows it describes (anonymisation, the retention purge of other tables), and it must record actions whose subject never existed, such as a failed login for an unknown email.

**Authentication events.** Every failed login writes `auth.login_failed`, and every wrong password re-entry inside a session writes the proposed `auth.reauth_failed` ([07 §3.6](07-security-threat-model-and-permissions.md#36-login-throttling-and-generic-errors)). A row names the account when the submitted email matches one (`subject_type = 'user'`, `subject_id` = `users.id`). Otherwise `subject_type = 'email_hash'` and `subject_id` is the hex HMAC-SHA256 of `'email:'` followed by the normalised email (`lower(btrim(email))`, as in `users_email_check`, §5.1), keyed with `HMAC_KEY_AUDIT_IP` ([07 §5.5](07-security-threat-model-and-permissions.md#55-encryption)). The hash has 64 characters whatever the email's length, and the prefix keeps it apart from the IP hashes made with the same key. The raw email is never written to `subject_id`, `changes` or `reason`: it may be a mistyped address of someone who is not a user, and a 254-character email would exceed `audit_logs_subject_check` and turn a 401 into a 500. T-SEC-101 (proposed) also fails a login with a 254-character unknown email and expects 401 and one `auth.login_failed` row whose `subject_id` has 64 characters.

**No personal values in `changes`.** `changes` never holds a personal value. A column of class Personal, Sensitive-personal or Secret, and any person's name, email address, phone number or postal address in a column of another class (for example `shop_payout_accounts.account_name`, `shops.grievance_contact_name`, or the invitee's email on `shop_invitation.create`), is recorded by name only, for example `{"changed":["grievance_contact_name"]}`. People are referenced by id (the invitation or user id), never by address or name. Values of the other columns (amounts, statuses, rates, codes, the Public shop contact) and flags such as `{"flags":["single_operator"]}` are recorded as they are. Little accountability is lost, because the source rows keep their history (payout accounts are replaced, never deleted; invitations are kept a year). This rule is what lets [04 §19.2](04-domain-model-and-data-dictionary.md) keep audit rows at anonymisation and [04 §19.3](04-domain-model-and-data-dictionary.md) keep them 7 years. T-SEC-102 (proposed) runs every audited action with fixture personal values and asserts that no fixture email, name or phone substring appears in `changes` or `reason`.

**Keys and constraints.**

```sql
CONSTRAINT audit_logs_pkey PRIMARY KEY (id),
CONSTRAINT audit_logs_actor_type_check
  CHECK (actor_type IN ('customer', 'shop_member', 'platform_staff', 'system', 'provider')),
CONSTRAINT audit_logs_actor_check
  CHECK (actor_type NOT IN ('shop_member', 'platform_staff') OR actor_user_id IS NOT NULL),
CONSTRAINT audit_logs_action_check CHECK (action ~ '^[a-z_]+(\.[a-z_]+)+$'),
CONSTRAINT audit_logs_subject_check CHECK (char_length(subject_type) BETWEEN 2 AND 40
  AND char_length(subject_id) BETWEEN 1 AND 100),
CONSTRAINT audit_logs_changes_check CHECK (jsonb_typeof(changes) = 'object'),
CONSTRAINT audit_logs_ip_hash_check CHECK (ip_hash IS NULL OR octet_length(ip_hash) = 32),
CONSTRAINT audit_logs_reason_check CHECK (reason IS NULL OR char_length(reason) <= 2000)
```

A customer actor may have no user id: anonymous authentication attempts are recorded with `actor_type = 'customer'` and a null id. Staff and shop actions always carry one.

`audit_logs_reason_check` allows 2,000 characters, the longest reason any audited action accepts: the suspension and rejection reasons of `shop_review_decisions` (§6.5) and the notes of `product_review_decisions` (§7.11) go up to 2,000 and are copied into the audit row in the same transaction. An action's validator caps its reason at its own column's limit, and no such limit exceeds 2,000, so a valid reason never fails this CHECK and rolls the action back with a 500.

**Indexes.**

| Index                        | Definition                                                 | Query served                                                                                                                                                                                                              |
| ---------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit_logs_subject_idx`     | `(subject_type, subject_id, id DESC)`                      | History of one order, refund, shop or user on its admin page                                                                                                                                                              |
| `audit_logs_actor_idx`       | `(actor_user_id, id DESC) WHERE actor_user_id IS NOT NULL` | "What did this staff member do" (`listAuditLogs?actor=`)                                                                                                                                                                  |
| `audit_logs_shop_idx`        | `(shop_id, id DESC) WHERE shop_id IS NOT NULL`             | Activity inside one shop                                                                                                                                                                                                  |
| `audit_logs_action_idx`      | `(action, id DESC)`                                        | Filter by action, for example every `refund.approve`                                                                                                                                                                      |
| `audit_logs_occurred_at_idx` | `(occurred_at)`                                            | Date-range browsing: `WHERE occurred_at >= :from AND occurred_at < :to ORDER BY id DESC LIMIT 50`; both retention deletes, in batches by `occurred_at < :cutoff` with the action class (`auth.*` or the rest) as a filter |

The time index is a B-tree, not BRIN. BRIN summarises block ranges and works only while the column follows the physical row order [Verified-doc <https://www.postgresql.org/docs/18/brin.html>]. That holds here only until the first retention delete: from year 2 the `auth.*` purge frees space on old pages that also hold rows kept 7 years, new rows are written into that space, and every old block range then spans years-old and current times, so a recent range and the purge's own `occurred_at < :cutoff` would read most of the table. Deletes never narrow a BRIN summary.

**Lifecycle and retention.** Insert-only for every role ([04 §2.12](04-domain-model-and-data-dictionary.md), T-ARCH-012 proposed). Financial and order actions are kept 7 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]). Authentication events (`auth.*`) are the bulk of the rows and are kept 2 years [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)]. The other actions (`shop.kyc_view`, `payout.account_reveal`, `shop_payout_account.reveal`, `refund.recipient_reveal`, `user.contact_reveal`, `audit_log.view`, `user.disclosure`, and staff and setting changes) are kept 7 years like financial actions [Assumption] (proposed, [07 §5.4](07-security-threat-model-and-permissions.md#54-retention-deletion-and-anonymisation); [04 §19.3](04-domain-model-and-data-dictionary.md)). Only the retention command deletes rows, through the retention exemption of `forbid_mutation()` (proposed, [04 §2.12](04-domain-model-and-data-dictionary.md)), and it writes an audit row saying what it removed.

### 15.4 `rate_limits` (limiter store)

**Module** `platform` (package-managed) · **Release** R0 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Personal (pseudonymised keys)

The database store of `@adonisjs/limiter` 3.0.1, chosen over Redis because PostgreSQL is the only stateful service in R1 (canon §6.1; OD-10 resolved). The table keeps the shape of the package's migration stub, as [04 §2.1](04-domain-model-and-data-dictionary.md) allows for package tables [Verified-doc `@adonisjs/limiter` 3.0.1 `build/make/migration/rate_limits.stub`, <https://registry.npmjs.org/@adonisjs/limiter/-/limiter-3.0.1.tgz>]:

| Column   | Type         | Null | Default | Notes                            |
| -------- | ------------ | ---- | ------- | -------------------------------- |
| `key`    | varchar(255) | no   | —       | Primary key; the limiter key     |
| `points` | integer      | no   | `0`     | Points consumed in the window    |
| `expire` | bigint       | yes  | —       | Window end in epoch milliseconds |

`varchar(255)` breaks the text-plus-CHECK rule of [04 §2.8](04-domain-model-and-data-dictionary.md) on purpose: the package owns this shape.

**Key rule.** Limiter keys are built by DripNepal code, not by the package, so the application hashes the identifying part: `login:acct_ip:<hex HMAC(email + '|' + ip)>` instead of the raw email and IP. The `ip` part is normalised as [07 §3.6](07-security-threat-model-and-permissions.md#36-login-throttling-and-generic-errors) requires before the HMAC is taken: it is the client network, an IPv4 address as is, an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) as that IPv4 address and any other IPv6 address as its /64 prefix, so one host cannot rotate through the addresses of its /64 into fresh keys. Two reasons for hashing. The table then holds no email addresses or IPs. And a 254-character email plus an IPv6 address would exceed 255 characters, fail with SQLSTATE 22001 and turn a login attempt into a 500. A hex HMAC-SHA256 is always 64 characters. T-SEC-101 (proposed) logs in with a 254-character email from an IPv6 address.

**Keys and constraints.** `rate_limits_pkey PRIMARY KEY (key)` from the stub.

**Indexes.** Primary key only. It serves every consume and penalize call.

**Lifecycle and retention.** The store option `clearExpiredByTimeout` "automatically clear[s] expired keys every 5 minutes" [Verified-doc limiter 3.0.1 `build/src/types.d.ts`] and is enabled. The table holds only live windows, a few thousand rows at most. Because it is in `public`, `schema:generate` emits a class for it; no model uses that class.

### 15.5 pg-boss schema (`pgboss`)

**Module** `platform` (package-managed) · **Release** R0 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Internal (payloads carry identifiers only, except `token_enc` on the token email queues, Secret, below)

pg-boss 12 stores queues, jobs and schedules in its own schema, `pgboss` (canon §6.2). pg-boss creates and migrates it; DripNepal migrations never touch it, and this document does not describe it column by column. pg-boss "uses declarative list-based partitioning to expose a single logical `job` table" [Verified-doc pg-boss documentation, Introduction, <https://github.com/timgit/pg-boss/tree/master/docs>]. The job table is DripNepal's transactional outbox: jobs are sent inside the business transaction, and "if the transaction rolls back, so does the job" (ADR-0010; [03 §10.1](03-system-architecture.md#101-transactional-send-the-job-table-is-the-outbox)).

Rules that concern data:

- **Payloads carry identifiers, not data.** A job payload holds ids (`{"shop_order_id": "…"}`) and the handler reads current rows. No email addresses, phone numbers, addresses or raw tokens go into a payload, because the job table is copied into every backup and kept after completion. The one exception is the token email path of [07 §3.8](07-security-threat-model-and-permissions.md#38-email-verification-reset-and-invitation-tokens): payloads of `notifications.dispatch` and `notifications.send_email` may carry `token_enc`, the raw token encrypted with the application `encryption` service (purpose `email_token:<kind>`, `expiresIn` equal to the token's own expiry), so a copy is useless without `APP_KEY` and after expiry.
- **Retention.** Queues keep the pg-boss defaults: queued jobs 14 days (`retentionSeconds`, 1209600) and completed jobs 7 days (`deleteAfterSeconds`, 604800) [Verified-doc <https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md>]. The exception is `notifications.dispatch`, `notifications.send_email` and their `dlq.*` queues, which set `deleteAfterSeconds: 86400` and `retentionSeconds: 604800`, so a token email job is gone one day after completion and at most 7 days after it was queued or dead-lettered, the longest token lifetime (07 §3.8 rule 2, [11 §8.1](11-deployment-and-operations.md#81-retries-and-dead-letters-the-operating-rules)). The other dead-letter queues (`dlq.<queue>`) keep failed payloads for redrive under the defaults.
- **Not in `database/schema.ts`.** `schema:generate` scans only the connection's search path, `public` by default ([04 §2.15](04-domain-model-and-data-dictionary.md)), so no Lucid class is generated for pg-boss tables and none may be written.
- **Privileges** [Assumption; confirm in the M0 spike]: pg-boss installs and migrates its schema from the release step under the migrator role, and the runtime role gets `USAGE` on schema `pgboss` and DML on `pgboss.*` only, so the web and worker processes cannot alter it. pg-boss creates these tables itself, so no baseline grant covers them: after every pg-boss schema install or upgrade, including the reinstall after a restore, the release step re-runs, as the migrator, `GRANT USAGE ON SCHEMA pgboss TO dripnepal_app` and `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA pgboss TO dripnepal_app` ([07 §4.10](07-security-threat-model-and-permissions.md#410-database-roles-and-grants)). The worker needs no DDL at run time because no queue sets `partition: true` and `persistQueueStats` stays off: a partitioned queue runs `CREATE TABLE` and `ATTACH PARTITION`, and recorded queue stats create a table partition each day.
- **Indexes.** Created and maintained by pg-boss for its own fetch and maintenance queries. DripNepal adds none, because no application query reads `pgboss.*` directly.
- **Fallback.** If the M0 spike shows that a Lucid transaction cannot be handed to pg-boss's Knex adapter, an `outbox_events` table is added to `public` with a relay job, and it is defined here at that point (canon §8).
- **Restore.** After a point-in-time restore, pg-boss replays jobs that were queued at the restore point. Every handler is idempotent (compare-and-set or dedupe key), so a replay changes nothing twice ([03 §10.3](03-system-architecture.md#103-at-least-once-delivery-and-idempotent-handlers)).
