# Data Dictionary: Tables (§5–§15)

Status: Draft v1 (2026-09-25)

This file is the table-by-table part of the domain model. It shares section numbering with [04 Domain model and data dictionary](04-domain-model-and-data-dictionary.md), which owns the scope and reading guide ([04 §1](04-domain-model-and-data-dictionary.md)), modelling conventions ([04 §2](04-domain-model-and-data-dictionary.md)), key modelling decisions ([04 §3](04-domain-model-and-data-dictionary.md)), ER diagrams ([04 §4](04-domain-model-and-data-dictionary.md)), invariants ([04 §16](04-domain-model-and-data-dictionary.md)), the index summary ([04 §17](04-domain-model-and-data-dictionary.md)), money rules ([04 §18](04-domain-model-and-data-dictionary.md)), data classification and retention ([04 §19](04-domain-model-and-data-dictionary.md)), the migration plan ([04 §20](04-domain-model-and-data-dictionary.md)) and reference data ([04 §21](04-domain-model-and-data-dictionary.md)). Read [04 §1.4](04-domain-model-and-data-dictionary.md) first: it defines the entry format every table below follows, the sensitivity classes and the lifecycle classes.

Editor notes for these sections are consolidated at the end of [04](04-domain-model-and-data-dictionary.md).

| Section | Module                  | Tables                                                                                                                                                                                                                                                             |
| ------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| §5      | identity                | users, user_tokens, sessions, platform_staff, user_addresses                                                                                                                                                                                                       |
| §6      | shops                   | shops, shop_memberships, shop_invitations, shop_agreements, shop_review_decisions, shop_addresses, shop_payout_accounts, shop_categories, shop_category_assignments, slug_redirects                                                                                |
| §7      | catalog, media          | categories, attributes, attribute_values, category_attributes, brands, products, product_attribute_values, product_option_axes, product_variants, variant_option_values, product_review_decisions, product_listings, media_assets, product_media, collections (R2) |
| §8      | inventory               | inventory_items, inventory_reservations, inventory_movements                                                                                                                                                                                                       |
| §9      | logistics               | provinces, districts, local_levels, delivery_zones, delivery_zone_districts, shop_delivery_coverage, shop_shipping_rates                                                                                                                                           |
| §10     | cart                    | carts, cart_items                                                                                                                                                                                                                                                  |
| §11     | orders                  | orders, shop_orders, order_items, order_events, shipments, shipment_events, return_requests, return_items                                                                                                                                                          |
| §12     | payments                | payments, payment_allocations, provider_events, refunds, refund_items                                                                                                                                                                                              |
| §13     | ledger                  | ledger_entries, payouts, payout_entries, vendor_remittances                                                                                                                                                                                                        |
| §14     | notifications, platform | support_cases, support_case_messages, notification_deliveries                                                                                                                                                                                                      |
| §15     | platform, audit         | platform_settings, idempotency_keys, audit_logs, rate_limits, pg-boss schema                                                                                                                                                                                       |

---

## 5. Identity and access tables

Owned by the `identity` module ([03 §4.4](03-system-architecture.md)). Other modules read these tables only through `app/modules/identity/queries.ts`. Permission slugs and role maps are in [07](07-security-threat-model-and-permissions.md). Session timeouts and TOTP parameters are in [07](07-security-threat-model-and-permissions.md) and [ADR-0005](adr/).

Two general notes for this section and the next two. First, a CHECK passes when its expression evaluates to NULL, not only when it is true [Verified-doc <https://www.postgresql.org/docs/18/ddl-constraints.html>]. Every CHECK below that must reject a missing value therefore tests `IS NOT NULL` explicitly; `CHECK (x IN ('a','b'))` alone lets a null `x` through. T-ARCH-013 (proposed) inserts, for each state-dependent CHECK, a row whose required column is null and expects SQLSTATE 23514. Second, on indexes: PostgreSQL does not index referencing columns automatically. An index on a foreign key column only speeds up joins and deletes of the referenced row. Reference rows (locations, categories, attributes) and users are never deleted, so foreign keys to them get an index only when a named query needs one.

### 5.1 `users`

**Module** `identity` · **Release** R1 (created in the R0 baseline) · **Shop scope** none · **Lifecycle** Entity · **Sensitivity** Personal; `phone_enc` Sensitive-personal; `password_hash`, `security_stamp`, `mfa_totp_secret_enc` Secret

One row per person. A customer, a seller and a staff member are the same kind of row; what they may do comes from `shops.owner_user_id`, `shop_memberships` and `platform_staff` ([04 §3.1](04-domain-model-and-data-dictionary.md), [04 §3.2](04-domain-model-and-data-dictionary.md)).

| Column                       | Type        | Null | Default                  | Notes                                                                                                                                                                                                                                                                                                                   |
| ---------------------------- | ----------- | ---- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                         | uuid        | no   | `uuidv7()`               |                                                                                                                                                                                                                                                                                                                         |
| `email`                      | citext      | no   | App                      | Login identifier. Trimmed and lower-cased before storage (RF-22). Replaced by a placeholder on anonymisation                                                                                                                                                                                                            |
| `email_verified_at`          | timestamptz | yes  |                          | Set by `confirmEmail`. Required for checkout and shop applications (FR-IAM-002)                                                                                                                                                                                                                                         |
| `password_hash`              | text        | yes  | App                      | scrypt PHC string from the existing hash config. Null only when anonymised. The column is renamed from `password` [Verified-repo `database/migrations/1761885935168_create_users_table.ts:16`], so the model sets `passwordColumnName: 'passwordHash'` (today `'password'`, [Verified-repo `app/models/user.ts:14-17`]) |
| `full_name`                  | text        | yes  | App                      | 1–100 characters, NFC. Null only when anonymised                                                                                                                                                                                                                                                                        |
| `phone_enc`                  | text        | yes  |                          | E.164 mobile number, encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)). Required before checkout (FR-CHK-001), checked by the action                                                                                                                                                                        |
| `phone_hash`                 | bytea       | yes  |                          | HMAC-SHA256 blind index ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                             |
| `phone_last4`                | char(4)     | yes  |                          | Masked display                                                                                                                                                                                                                                                                                                          |
| `phone_verified_at`          | timestamptz | yes  |                          | Phone OTP, R2 (FR-IAM-010). Always null in R1                                                                                                                                                                                                                                                                           |
| `marketing_email_consent_at` | timestamptz | yes  |                          | Opt-in time. Null means no consent (FR-IAM-013; Advertisement (Regulation) Act 2076 s10 [Verified-doc <https://lawcommission.gov.np/content/13398/ad--regulation--act-act--2076/>])                                                                                                                                     |
| `marketing_sms_consent_at`   | timestamptz | yes  |                          | As above, for SMS (used from R2)                                                                                                                                                                                                                                                                                        |
| `age_confirmed_at`           | timestamptz | yes  |                          | 18+ confirmation at signup [Assumption A-26; Open OD-24]                                                                                                                                                                                                                                                                |
| `status`                     | text        | no   | `'pending_verification'` | Values in the CHECK below; what each state allows is in [07](07-security-threat-model-and-permissions.md)                                                                                                                                                                                                               |
| `security_stamp`             | uuid        | no   | `gen_random_uuid()`      | Random (v4), not time-ordered. Copied into the session at login and compared on every request. Rotated on password change, suspension and "log out everywhere" (ADR-0005, T-SEC-010)                                                                                                                                    |
| `mfa_totp_secret_enc`        | text        | yes  |                          | TOTP secret, encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)). Written at `startTotpEnrollment`                                                                                                                                                                                                            |
| `mfa_enabled_at`             | timestamptz | yes  |                          | Set at `confirmTotpEnrollment`. Required for platform staff (FR-IAM-007)                                                                                                                                                                                                                                                |
| `mfa_last_used_step`         | bigint      | yes  |                          | Last accepted TOTP time step. A code whose step is not greater is refused, so an intercepted code cannot be replayed within its window                                                                                                                                                                                  |
| `last_login_at`              | timestamptz | yes  |                          | Written by the `session_auth:login_succeeded` listener                                                                                                                                                                                                                                                                  |
| `deletion_requested_at`      | timestamptz | yes  |                          | Set by `requestAccountDeletion` (FR-IAM-009)                                                                                                                                                                                                                                                                            |
| `anonymized_at`              | timestamptz | yes  |                          | Set by `anonymizeUser` ([04 §19.2](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                             |
| `created_at`, `updated_at`   | timestamptz | no   | `now()`                  | `updated_at` by trigger ([04 §2.2](04-domain-model-and-data-dictionary.md))                                                                                                                                                                                                                                             |

**Keys and constraints**

- `users_pkey PRIMARY KEY (id)`.
- `users_email_key UNIQUE (email)`. Case-insensitive through `citext`, which fixes IAM-14.
- `users_email_check CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(btrim(email::text)))`. The cast to `text` matters: `citext` equality would make `email = lower(email)` always true.
- `users_status_check CHECK (status IN ('pending_verification','active','suspended','deactivated','anonymized'))`.
- `users_full_name_check CHECK (full_name IS NULL OR char_length(full_name) BETWEEN 1 AND 100)`.
- `users_identity_required_check CHECK (status = 'anonymized' OR (full_name IS NOT NULL AND password_hash IS NOT NULL))`. A null password can no longer produce the empty login response of MISSED-schema-integrity. The bootstrap command that invites the first administrator stores the hash of a random 32-byte secret nobody knows, then sends a password-reset token.
- `users_active_verified_check CHECK (status <> 'active' OR email_verified_at IS NOT NULL)`.
- `users_deactivated_check CHECK (status <> 'deactivated' OR deletion_requested_at IS NOT NULL)`.
- `users_phone_parts_check CHECK ((phone_enc IS NULL) = (phone_hash IS NULL) AND (phone_enc IS NULL) = (phone_last4 IS NULL))`: ciphertext, blind index and mask are written together or not at all.
- `users_phone_hash_check CHECK (phone_hash IS NULL OR octet_length(phone_hash) = 32)`; `users_phone_last4_check CHECK (phone_last4 ~ '^[0-9]{4}$')`.
- `users_mfa_check CHECK (mfa_enabled_at IS NULL OR mfa_totp_secret_enc IS NOT NULL)`.
- `users_anonymized_check CHECK ((status = 'anonymized') = (anonymized_at IS NOT NULL) AND (status <> 'anonymized' OR (full_name IS NULL AND password_hash IS NULL AND phone_enc IS NULL AND mfa_totp_secret_enc IS NULL AND marketing_email_consent_at IS NULL AND marketing_sms_consent_at IS NULL)))`. An anonymised row cannot keep personal data by mistake (AC-FR-IAM-009-3).
- `users_verified_phone_key UNIQUE (phone_hash) WHERE phone_verified_at IS NOT NULL` (partial unique index). It has no effect in R1, where no phone is verified. From R2 a verified phone belongs to one account, which phone OTP login needs. Unverified numbers may repeat, because families share phones and COD fraud review needs to see those clusters.
- Not expressible as a constraint: the phone format (`^\+9779[678]\d{8}$`, [04 §2.8](04-domain-model-and-data-dictionary.md)) is checked by the validator only, because the database sees ciphertext. This is the price of [04 §2.9](04-domain-model-and-data-dictionary.md).

**Indexes**

| Index                                                                                  | Query it serves                                                                                               |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `users_email_key` (unique)                                                             | Login `WHERE email = ?` (auth finder); signup and invitation email match; admin exact-email search            |
| `users_phone_hash_idx ON (phone_hash) WHERE phone_hash IS NOT NULL`                    | COD fraud review "other accounts with this phone" and admin search by phone: `WHERE phone_hash = hmac(:e164)` |
| `users_deletion_queue_idx ON (deletion_requested_at, id) WHERE status = 'deactivated'` | Admin deletion-request queue, oldest first (AC-FR-IAM-009-1)                                                  |

The admin user list filtered by status or name is a sequential scan. That is acceptable up to about 100,000 users [Assumption]; past that, add a `pg_trgm` index on `full_name` rather than a guess now.

**Lifecycle and retention.** `signUp` inserts `pending_verification`. `confirmEmail` moves the user to `active`. Staff suspend and reinstate. `requestAccountDeletion` moves the user to `deactivated` and revokes sessions. `anonymizeUser` moves the user to `anonymized` once the blockers of AC-FR-IAM-009-2 are clear. Transitions are compare-and-set on `status` (the permitted user transitions and who may make them are in [07](07-security-threat-model-and-permissions.md)). The row is never deleted: `orders.customer_user_id`, `shops.owner_user_id` and many `*_by` columns reference it with `RESTRICT`. Personal fields are removed at anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)), and the row itself is kept as long as any record that references it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

Verified by T-IAM-104 (proposed; `Ram@x.com` then `ram@x.com` returns 422 on `email`), T-IAM-103 ([04 §2.9](04-domain-model-and-data-dictionary.md)) and T-IAM-106 (proposed; anonymisation leaves the order history readable and passes `users_anonymized_check`).

### 5.2 `user_tokens`

**Module** `identity` · **Release** R1 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Secret (`token_hash`)

Single-use tokens for email verification and password reset. Staff invitations have their own table (§6.3).

| Column        | Type        | Null | Default    | Notes                                                                                                                               |
| ------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `id`          | uuid        | no   | `uuidv7()` |                                                                                                                                     |
| `user_id`     | uuid        | no   | App        |                                                                                                                                     |
| `purpose`     | text        | no   | App        | `email_verification` or `password_reset`                                                                                            |
| `token_hash`  | bytea       | no   | App        | SHA-256 of the raw token (32 random bytes, base64url in the emailed link). The raw token is never stored                            |
| `expires_at`  | timestamptz | no   | App        | 24 h for email verification, 1 h for password reset [Assumption; [07](07-security-threat-model-and-permissions.md) owns the values] |
| `consumed_at` | timestamptz | yes  |            | Set when used, or when a newer token, a password change or an email change invalidates it                                           |
| `created_at`  | timestamptz | no   | `now()`    |                                                                                                                                     |

**Keys and constraints**

- `user_tokens_pkey PRIMARY KEY (id)`; `user_tokens_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT`.
- `user_tokens_token_hash_key UNIQUE (token_hash)`; `user_tokens_token_hash_check CHECK (octet_length(token_hash) = 32)`.
- `user_tokens_purpose_check CHECK (purpose IN ('email_verification','password_reset'))`.
- `user_tokens_expiry_check CHECK (expires_at > created_at AND expires_at <= created_at + interval '7 days')`.
- `user_tokens_live_key UNIQUE (user_id, purpose) WHERE consumed_at IS NULL` (partial): at most one usable token per purpose. Issuing a new token first sets `consumed_at` on the previous one, in the same transaction.
- A plain SHA-256 is enough here, unlike phone numbers ([04 §2.9](04-domain-model-and-data-dictionary.md)): the input has 256 bits of entropy, so the hash cannot be reversed by trying candidates.

**Indexes**

| Index                                        | Query it serves                                                                                                                                                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `user_tokens_token_hash_key`                 | Redeem in one statement: `UPDATE user_tokens SET consumed_at = now() WHERE token_hash = :h AND consumed_at IS NULL AND expires_at > now() RETURNING user_id, purpose`. Two concurrent redemptions cannot both succeed |
| `user_tokens_live_key`                       | Invalidate before issuing: `UPDATE … SET consumed_at = now() WHERE user_id = ? AND purpose = ? AND consumed_at IS NULL`                                                                                               |
| `user_tokens_expires_at_idx ON (expires_at)` | Purge: `DELETE FROM user_tokens WHERE expires_at < now() - interval '7 days'` in batches                                                                                                                              |

**Lifecycle and retention.** Inserted by `signUp`, `resendEmailVerification` and `requestPasswordReset`. Consumed by `confirmEmail` and `resetPassword`. All live tokens of a user are consumed when the password or email changes, and at suspension or anonymisation. Rows are hard-deleted 7 days after expiry by a daily `identity.purge-expired-tokens` job ([04 §19.3](04-domain-model-and-data-dictionary.md)). Verified by T-IAM-105 (proposed; concurrent redemption of one token: exactly one succeeds).

### 5.3 `sessions` (session store table)

**Module** `identity` (table written by `@adonisjs/session`) · **Release** R0 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Secret

The server-side session store required by ADR-0005. It replaces the cookie store, which cannot revoke sessions (RF-04). The migration comes from `node ace make:session-table`, and the configuration uses `stores.database()` with its default table name `sessions` [Verified-doc `@adonisjs/session` 8.1.0 `build/make/migration/sessions.stub` and `build/database-CuWB6hfN.js`, <https://registry.npmjs.org/@adonisjs/session/-/session-8.1.0.tgz>].

| Column       | Type         | Null | Default | Notes                                                                                |
| ------------ | ------------ | ---- | ------- | ------------------------------------------------------------------------------------ |
| `id`         | varchar(255) | no   | package | Session ID, the value the session cookie carries. A bearer credential                |
| `data`       | text         | no   | package | Session values serialised as a JSON message. **Not encrypted** by the database store |
| `user_id`    | varchar(255) | yes  |         | Written by `session.tag(String(user.id))` after login; text, not uuid                |
| `expires_at` | timestamptz  | no   | package | Last write plus the configured session `age`                                         |

**Keys and constraints**

- `sessions_pkey PRIMARY KEY (id)`, as generated by the stub. DripNepal adds no CHECKs or foreign keys: the package upserts rows (`ON CONFLICT (id) MERGE data, expires_at`), and a constraint it does not expect would turn a normal request into a 500. `user_id` is text because the package writes `String(userId)`, so it cannot reference `users (id)` anyway.
- What `data` may contain is fixed in code ([07](07-security-threat-model-and-permissions.md)): the authenticated user ID, the `security_stamp` copy, `authenticated_at` for the absolute timeout, `mfa_verified_at`, the CSRF secret, flash messages and the intended URL. Never cart contents (the cart is a table, §10.1), and no personal data beyond the user ID.

**Indexes** (both created by the stub)

| Index                 | Query it serves                                                                                                                                                                                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| index on `user_id`    | `SessionCollection.tagged(userId)`: `SELECT id, data FROM sessions WHERE user_id = ? AND expires_at > now()`, used by "log out everywhere", suspension and password change (job `identity.revoke-sessions`, [03 §9](03-system-architecture.md)) |
| index on `expires_at` | Garbage collection: after a write, with probability `gcProbability` (default 2%), `DELETE FROM sessions WHERE expires_at <= now()`                                                                                                              |

**Lifecycle and retention.** One row per browser session. Login regenerates the ID, so the row is re-keyed, and the tag is applied after `login()`: a tag set before it would stay on the ID that `login()` destroys (read from the `@adonisjs/session` 8.1.0 source, not yet run; M1 confirms it). The database `age` is the longest idle period any user may have, 7 days for customers [Assumption A-23]. The shorter seller and admin idle limits and the 30-day absolute limit are enforced by middleware from timestamps in `data`, because the store has one `age` for everyone. Expired rows disappear through garbage collection.

**Tradeoff.** A database reader can copy a live session ID from `sessions.id` and act as that user. The mitigations are the runtime role and backups being the only access paths ([07](07-security-threat-model-and-permissions.md)) and short idle limits for privileged surfaces. After any suspected database leak, the incident runbook ([11](11-deployment-and-operations.md)) runs `TRUNCATE sessions`, which logs everyone out. Verified by T-SEC-010 and T-IAM-109 (proposed; "log out everywhere" removes every tagged row, and the old cookie is then rejected).

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
- Application-enforced: at least one active `platform_admin` must remain. `setPlatformStaffRole` and `revokePlatformStaff` lock all active admin rows (`SELECT … WHERE role = 'platform_admin' AND revoked_at IS NULL FOR UPDATE`) before checking, so two admins cannot demote each other at the same moment. T-IAM-110 (proposed). Staff without `users.mfa_enabled_at` cannot reach `/admin` (FR-IAM-007); that is a session check, not a constraint.

**Indexes.** The primary key serves the per-request staff check `WHERE user_id = ? AND revoked_at IS NULL`. The staff list reads the whole table (fewer than 20 rows).

**Lifecycle and retention.** One row per person, updated in place when the role changes or access is revoked. Every change writes an `audit_logs` row, which is where role history lives. Rows are kept while the user row exists ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 5.5 `user_addresses`

**Module** `identity` · **Release** R1 · **Shop scope** none (user-scoped) · **Lifecycle** Configuration · **Sensitivity** Sensitive-personal

The customer's address book. Checkout copies the chosen address into `orders.shipping_address` (§11.1), so orders never reference this table. Editing or archiving an address therefore cannot change or delete an order, which fixes RF-06 and the address IDOR of MISSED-schema-integrity.

| Column                     | Type        | Null | Default    | Notes                                                                                                             |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                   |
| `user_id`                  | uuid        | no   | App        |                                                                                                                   |
| `label`                    | text        | yes  |            | "Home", "Office"; at most 30 characters                                                                           |
| `recipient_name_enc`       | text        | no   | App        | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                     |
| `recipient_phone_enc`      | text        | no   | App        | Encrypted E.164 mobile. The same number may appear on addresses of different users (AC-FR-IAM-012-3; fixes RF-11) |
| `recipient_phone_last4`    | char(4)     | no   | App        | Masked display in lists                                                                                           |
| `province_code`            | text        | no   | App        | Reference to §9.1                                                                                                 |
| `district_code`            | text        | no   | App        | Reference to §9.2                                                                                                 |
| `local_level_code`         | text        | no   | App        | Nepal Post 5-digit local-level code, reference to §9.3 [Verify-external VX-10]                                    |
| `ward_no`                  | smallint    | no   | App        | 1 to the local level's `ward_count`                                                                               |
| `area_tole_enc`            | text        | no   | App        | Area or tole, encrypted                                                                                           |
| `street_landmark_enc`      | text        | yes  |            | Street and landmark, encrypted                                                                                    |
| `postal_code`              | text        | no   | generated  | `GENERATED ALWAYS AS (local_level_code                                                                            |     | lpad(ward_no::text, 2, '0')) STORED`: the 7-digit Nepal Post ward code, 5-digit local-level code plus 2-digit ward [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/Postal%20Code_wteggid.pdf>]. Derived, so users are never asked for it |
| `is_default`               | boolean     | no   | `false`    |                                                                                                                   |
| `archived_at`              | timestamptz | yes  |            | Set by `deleteAddress`                                                                                            |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                   |

The generated column is declared `STORED` explicitly, because PostgreSQL 18 makes generated columns `VIRTUAL` by default, and its expression may use only immutable functions [Verified-doc <https://www.postgresql.org/docs/18/ddl-generated-columns.html>]. Application code never assigns it. If an assignment slips in, PostgreSQL rejects the write, because a generated column cannot be written to [Verified-doc same page], so the mistake fails in tests instead of storing a wrong code.

**Keys and constraints**

- `user_addresses_pkey PRIMARY KEY (id)`; `user_addresses_user_fkey FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT`.
- Location chain ([04 §2.5](04-domain-model-and-data-dictionary.md)): `user_addresses_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT`; `user_addresses_district_fkey FOREIGN KEY (district_code, province_code) REFERENCES districts (code, province_code) ON DELETE RESTRICT`; `user_addresses_local_level_fkey FOREIGN KEY (local_level_code, district_code) REFERENCES local_levels (code, district_code) ON DELETE RESTRICT`. A district from one province and a local level from another cannot be stored (RF-29). T-IAM-108 (proposed) expects 23503, mapped to 422.
- `user_addresses_ward_no_check CHECK (ward_no BETWEEN 1 AND 40)`. The largest local level has 33 wards [Verified-doc Nepal Post list above]. The exact upper bound per local level is checked by the action against `local_levels.ward_count` (AC-FR-IAM-012-2), because a CHECK cannot read another table.
- `user_addresses_label_check CHECK (label IS NULL OR char_length(label) BETWEEN 1 AND 30)`; `user_addresses_recipient_phone_last4_check CHECK (recipient_phone_last4 ~ '^[0-9]{4}$')`.
- `user_addresses_default_not_archived_check CHECK (NOT (is_default AND archived_at IS NOT NULL))`.
- `user_addresses_one_default_key UNIQUE (user_id) WHERE is_default AND archived_at IS NULL` (partial): at most one default (fixes A1-12). Changing the default clears the old one and sets the new one in one transaction. T-IAM-107 (proposed) runs two concurrent "make default" requests and expects exactly one default afterwards.
- Application-enforced: at most 10 active addresses per user [Assumption, AC-FR-IAM-012-4]; the user's first address becomes the default. Checkout loads the address with `WHERE id = :address_id AND user_id = :auth_user_id AND archived_at IS NULL`, never by ID alone.

**Indexes**

| Index                                                                               | Query it serves                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `user_addresses_user_active_idx ON (user_id, created_at) WHERE archived_at IS NULL` | Address book and checkout picker: `WHERE user_id = ? AND archived_at IS NULL ORDER BY is_default DESC, created_at` |
| `user_addresses_one_default_key`                                                    | Default lookup for the checkout quote                                                                              |
| `user_addresses_archived_idx ON (archived_at) WHERE archived_at IS NOT NULL`        | Purge of archived rows after the grace period                                                                      |

The location foreign keys get no index: reference rows are never deleted.

**Lifecycle and retention.** Created and edited in place by the address endpoints; placed orders are unaffected because they hold a snapshot. `deleteAddress` sets `archived_at`. Archived rows are hard-deleted after 30 days [Assumption], which leaves a short window for support questions about a just-removed address. All of a user's addresses are hard-deleted at anonymisation ([04 §19.2](04-domain-model-and-data-dictionary.md)). Retention is set in [04 §19.3](04-domain-model-and-data-dictionary.md).

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
| `grievance_contact_name`          | text        | no   | App                | Seller's grievance contact (s16)                                                                                                                                                          |
| `grievance_contact_phone_enc`     | text        | no   | App                | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md))                                                                                                                             |
| `submitted_at`                    | timestamptz | no   | `now()`            | Set at application and at each resubmission; orders the review queue                                                                                                                      |
| `approved_at`                     | timestamptz | yes  |                    | First approval                                                                                                                                                                            |
| `approved_by`                     | uuid        | yes  |                    | Staff user                                                                                                                                                                                |
| `closed_at`                       | timestamptz | yes  |                    |                                                                                                                                                                                           |
| `version`                         | int         | no   | `1`                | Optimistic concurrency ([04 §2.10](04-domain-model-and-data-dictionary.md))                                                                                                               |
| `created_at`, `updated_at`        | timestamptz | no   | `now()`            |                                                                                                                                                                                           |

**Keys and constraints**

- `shops_pkey PRIMARY KEY (id)`; `shops_owner_user_fkey FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE RESTRICT`; `shops_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE RESTRICT`.
- `shops_logo_media_fkey FOREIGN KEY (logo_media_id, id) REFERENCES media_assets (id, shop_id) ON DELETE RESTRICT` and `shops_banner_media_fkey` likewise. These are the nullable composite references of [04 §2.5](04-domain-model-and-data-dictionary.md): another shop's image is rejected, and no logo is fine. `shops` and `media_assets` reference each other, so the baseline creates `shops`, then `media_assets`, then adds these two keys with `ALTER TABLE` ([04 §20.2](04-domain-model-and-data-dictionary.md)). That the asset is of the right kind and `ready` is checked by `updateShopProfile`.
- `shops_slug_key UNIQUE (slug)`; `shops_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$')`. The reserved-word list is in code ([04 §2.8](04-domain-model-and-data-dictionary.md)), because it grows with routes.
- `shops_name_check CHECK (char_length(name) BETWEEN 2 AND 60)`; `shops_description_check CHECK (description IS NULL OR char_length(description) <= 2000)`; `shops_return_policy_check CHECK (char_length(return_policy_text) BETWEEN 1 AND 5000)`; `shops_grievance_name_check CHECK (char_length(grievance_contact_name) BETWEEN 2 AND 100)`.
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
- Application-enforced, because they need other tables: approval requires an agreement row for a version the platform accepts, the KYC documents required by OD-16, an active default pickup address, and delivery coverage with rates (AC-FR-SHOP-002-2); the shop-count limit ([04 §3.1](04-domain-model-and-data-dictionary.md)); a shop slug may not equal an `old_slug` in `slug_redirects` held by another shop (§6.10). Verified by T-SHOP-103, T-SHOP-104 and T-SHOP-106 (proposed).

**Indexes**

| Index                                        | Query it serves                                                                                                                                                                   |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shops_slug_key` (unique)                    | Seller context resolution on every `/seller/{shopSlug}` and `/api/v1/seller/shops/{shopSlug}` request; public shop page `/shops/{shopSlug}`                                       |
| `shops_owner_idx ON (owner_user_id, status)` | Shop switcher (owned shops), the `max_shops_per_owner` count `WHERE owner_user_id = ? AND status IN ('pending_review','active','suspended')`, and the anonymisation blocker check |

The admin application queue (`WHERE status = 'pending_review' ORDER BY submitted_at`) and shop list read fewer than 50 rows at launch (Q1) and get no index. Revisit above 5,000 shops.

**Lifecycle and retention.** `applyForShop` inserts the row with `pending_review`, together with the agreement row, addresses and category assignments, in one transaction. Staff decisions change `status` by compare-and-set `WHERE id = ? AND status = :from AND version = :v`, so two reviewers deciding at once produce one success and one 409 (AC-FR-SHOP-002-5). Each decision appends a `shop_review_decisions` row. A shop is never deleted: orders, ledger entries and payouts reference it. A closed shop keeps its slug for good, so an old link never opens a different shop. The row and its business fields are kept at least as long as the shop's financial records, at least 6 years after closure ([04 §19.3](04-domain-model-and-data-dictionary.md)) [Verify-external VX-08]. Three transformers control exposure: public, member and admin views. The public one never includes `owner_user_id` or any business, tax or grievance field (AC-FR-SHOP-003-3, AC-FR-SHOP-013-4, RF-36).

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
- Application-enforced: the owner cannot be invited or become a member (`inviteMember` and `acceptShopInvitation` compare with `shops.owner_user_id`); at most 20 active members per shop [Assumption, AC-FR-SHOP-005-4], counted after locking the shop row. T-SHOP-102 (proposed).

**Indexes**

| Index                                                                   | Query it serves                                                                                                                                                                         |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_memberships_shop_user_key`                                        | Seller context resolution: `WHERE shop_id = ? AND user_id = ? AND status = 'active'` on every seller request after the owner check; member list `WHERE shop_id = ? ORDER BY created_at` |
| `shop_memberships_user_active_idx ON (user_id) WHERE status = 'active'` | Shop switcher and shared props, "shops where I am staff" (fixes RF-44)                                                                                                                  |

**Lifecycle and retention.** Created on invitation acceptance. A role change updates the row. Removal sets `status = 'removed'` and keeps the row, so a former member's past actions stay attributable (IAM-13). Re-inviting a removed member reactivates the same row. Role history is in `audit_logs`. Rows are kept as long as the shop ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 6.3 `shop_invitations`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record (short-lived purpose, kept for attribution) · **Sensitivity** Personal (`email`); Secret (`token_hash`)

Email invitations to join a shop ([03 §7.6](03-system-architecture.md), FR-SHOP-005).

| Column                | Type        | Null | Default    | Notes                                                                |
| --------------------- | ----------- | ---- | ---------- | -------------------------------------------------------------------- |
| `id`                  | uuid        | no   | `uuidv7()` |                                                                      |
| `shop_id`             | uuid        | no   | App        |                                                                      |
| `email`               | citext      | no   | App        | Invitee, lower-cased. Must equal the accepting user's verified email |
| `role`                | text        | no   | App        | As `shop_memberships.role`                                           |
| `token_hash`          | bytea       | no   | App        | SHA-256 of the 32-byte random token                                  |
| `expires_at`          | timestamptz | no   | App        | `created_at` + 7 days                                                |
| `accepted_at`         | timestamptz | yes  |            |                                                                      |
| `accepted_by_user_id` | uuid        | yes  |            |                                                                      |
| `revoked_at`          | timestamptz | yes  |            | Revoked by a member with `shop.staff.manage`, or by a re-invite      |
| `invited_by`          | uuid        | no   | App        |                                                                      |
| `created_at`          | timestamptz | no   | `now()`    |                                                                      |

**Keys and constraints**

- `shop_invitations_pkey PRIMARY KEY (id)`; FKs to `shops (id)` and `users (id)` (`invited_by`, `accepted_by_user_id`), all `ON DELETE RESTRICT`.
- `shop_invitations_token_hash_key UNIQUE (token_hash)`; `shop_invitations_token_hash_check CHECK (octet_length(token_hash) = 32)`.
- `shop_invitations_role_check CHECK (role IN ('manager','catalog_editor','order_fulfiller','viewer'))`.
- `shop_invitations_email_check CHECK (char_length(email::text) BETWEEN 3 AND 254 AND email::text = lower(email::text))`.
- `shop_invitations_outcome_check CHECK (NOT (accepted_at IS NOT NULL AND revoked_at IS NOT NULL) AND (accepted_at IS NULL) = (accepted_by_user_id IS NULL))`; `shop_invitations_expiry_check CHECK (expires_at > created_at)`.
- `shop_invitations_pending_key UNIQUE (shop_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL` (partial): one open invitation per address per shop. A partial index predicate cannot use `now()`, so an expired open invitation still counts; `inviteMember` revokes it first in the same transaction.

**Indexes**

| Index                             | Query it serves                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `shop_invitations_token_hash_key` | `GET /invitations/{token}` and `acceptShopInvitation`: `WHERE token_hash = ? … FOR UPDATE`                               |
| `shop_invitations_pending_key`    | Pending list and the limit of 20 pending invitations: `WHERE shop_id = ? AND accepted_at IS NULL AND revoked_at IS NULL` |

**Lifecycle and retention.** Accepted or revoked by compare-and-set on the two nullable timestamps. Unknown, expired and revoked tokens all return 404. Application code never deletes rows ([04 §2.6](04-domain-model-and-data-dictionary.md)). The retention purge removes an invitation one year after it was accepted, revoked or expired ([04 §19.3](04-domain-model-and-data-dictionary.md)); the `audit_logs` rows record the event after that.

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
- Append-only: `REVOKE UPDATE, DELETE, TRUNCATE` from the runtime role plus the `forbid_mutation()` trigger ([04 §2.12](04-domain-model-and-data-dictionary.md)). T-ARCH-012.
- Application-enforced: only the owner can accept, checked against `shops.owner_user_id` inside the transaction.

**Indexes.** `shop_agreements_shop_version_key` serves the publish and approval gate: `EXISTS (SELECT 1 FROM shop_agreements WHERE shop_id = ? AND agreement_version = ANY(:still_accepted_versions))` (AC-FR-SHOP-013-3).

**Lifecycle and retention.** One insert per shop per accepted version, never changed. Kept for the life of the shop plus the financial-record period, at least 6 years after closure ([04 §19.3](04-domain-model-and-data-dictionary.md)) [Verify-external VX-08]: it is the contract behind the shop's sales.

### 6.5 `shop_review_decisions`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (the reason is shown to the applicant)

Staff decisions on a shop: application approval or rejection, suspension and reinstatement (AC-FR-SHOP-002-4, FR-SHOP-007). Closure (admin-only in R1) is recorded in `audit_logs` only.

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
- Application-enforced: approval needs a default pickup address; if no return address exists, returns go to the default pickup address.

**Indexes.** `shop_addresses_shop_idx ON (shop_id, purpose) WHERE archived_at IS NULL` serves the settings page and the approval check. The partial unique index serves "default pickup address of this shop".

**Lifecycle and retention.** As §5.5: edited in place, archived on delete, archived rows hard-deleted after 30 days [Assumption] ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 6.7 `shop_payout_accounts`

**Module** `shops` · **Release** R1 (captured and verified), used for payouts from R1.1 · **Shop scope** shop · **Lifecycle** Configuration (replaced, never deleted) · **Sensitivity** Financial; `account_number_enc` Sensitive-personal and Financial

The bank or wallet account the platform pays the shop's balance to (FR-SHOP-010).

| Column                     | Type        | Null | Default    | Notes                                                                                     |
| -------------------------- | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                           |
| `shop_id`                  | uuid        | no   | App        |                                                                                           |
| `method`                   | text        | no   | App        | `bank_transfer` or `wallet`                                                               |
| `account_name`             | text        | no   | App        | Account holder name as the bank or wallet shows it                                        |
| `bank_name`                | text        | no   | App        | Bank name, or the wallet provider for `wallet`                                            |
| `branch_name`              | text        | yes  |            | Bank branch, when the bank needs it for transfers                                         |
| `account_number_enc`       | text        | no   | App        | Encrypted ([04 §2.9](04-domain-model-and-data-dictionary.md)); for wallets, the wallet ID |
| `account_number_last4`     | char(4)     | no   | App        | The only part any response shows                                                          |
| `created_by`               | uuid        | no   | App        | The owner who entered it                                                                  |
| `verified_at`              | timestamptz | yes  |            | Set by a `finance_officer`                                                                |
| `verified_by`              | uuid        | yes  |            |                                                                                           |
| `replaced_at`              | timestamptz | yes  |            | Set when a newer account replaces this one                                                |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                           |

**Keys and constraints**

- `shop_payout_accounts_pkey PRIMARY KEY (id)`; FKs to `shops (id)` and `users (id)` (`created_by`, `verified_by`), `ON DELETE RESTRICT`.
- `shop_payout_accounts_method_check CHECK (method IN ('bank_transfer','wallet'))`; `shop_payout_accounts_last4_check CHECK (account_number_last4 ~ '^[0-9]{4}$')`; `shop_payout_accounts_account_name_check CHECK (char_length(account_name) BETWEEN 2 AND 100)`.
- `shop_payout_accounts_verification_check CHECK ((verified_at IS NULL) = (verified_by IS NULL) AND (verified_by IS NULL OR verified_by <> created_by))`: the verifier is never the person who entered the account (AC-FR-SHOP-010-3). This check is not relaxed by `single_operator_mode`, because an owner verifying their own bank account defeats the point of verifying.
- `shop_payout_accounts_active_key UNIQUE (shop_id) WHERE replaced_at IS NULL` (partial): one active account per shop. `replacePayoutAccount` sets `replaced_at` on the old row and inserts the new one in one transaction.
- Application-enforced: only the owner can read or replace the account, and replacing requires re-entering the password [Assumption, AC-FR-SHOP-010-1]. Payouts (R1.1) go only to the active row with `verified_at IS NOT NULL` (§13.2). T-SHOP-105 (proposed).

**Indexes.** `shop_payout_accounts_active_key` serves `getPayoutAccount` and the payout eligibility check. The finance verification queue (`WHERE verified_at IS NULL AND replaced_at IS NULL`) reads fewer than 50 rows and has no index.

**Lifecycle and retention.** A replaced account is kept, because a past payout must show where the money went. Rows are kept at least 6 years after `replaced_at` or after the last payout to them, whichever is later ([04 §19.3](04-domain-model-and-data-dictionary.md)) [Verify-external VX-08].

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

**Lifecycle and retention.** Seeded by the production-safe reference seeder (idempotent upsert on `code`). Deactivated, never deleted. Kept indefinitely.

### 6.9 `shop_category_assignments`

**Module** `shops` · **Release** R1 · **Shop scope** shop · **Lifecycle** Configuration · **Sensitivity** Public

Which shop categories a shop belongs to. Replaces `shop_categories_shop`.

| Column               | Type        | Null | Default | Notes |
| -------------------- | ----------- | ---- | ------- | ----- |
| `shop_id`            | uuid        | no   | App     |       |
| `shop_category_code` | text        | no   | App     |       |
| `created_at`         | timestamptz | no   | `now()` |       |

**Keys and constraints.** `shop_category_assignments_pkey PRIMARY KEY (shop_id, shop_category_code)`; `shop_category_assignments_shop_fkey` to `shops (id)` and `shop_category_assignments_category_fkey` to `shop_categories (code)`, both `ON DELETE RESTRICT`. Application-enforced: 1 to 3 categories per shop [Assumption], all active. Written with the query builder (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** The primary key serves "categories of this shop". A reverse index for a shop directory is added with that feature.

**Lifecycle and retention.** Replaced as a set by the shop profile update (delete and insert in one transaction, audited). Kept as long as the shop.

### 6.10 `slug_redirects`

**Module** `shops` (shop slugs) and `catalog` (category slugs) · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Old shop and category slugs, so that old URLs answer 301 ([04 §3.13](04-domain-model-and-data-dictionary.md), FR-SHOP-012, AC-FR-CAT-001-3).

| Column        | Type        | Null | Default | Notes                                                 |
| ------------- | ----------- | ---- | ------- | ----------------------------------------------------- |
| `entity_type` | text        | no   | App     | `shop` or `category`                                  |
| `old_slug`    | citext      | no   | App     | The retired slug                                      |
| `entity_id`   | uuid        | no   | App     | `shops.id` or `categories.id`                         |
| `created_by`  | uuid        | yes  |         | Staff user; null when written by the reference seeder |
| `created_at`  | timestamptz | no   | `now()` |                                                       |

**Keys and constraints**

- `slug_redirects_pkey PRIMARY KEY (entity_type, old_slug)`: an old slug maps to one entity per type.
- `slug_redirects_entity_type_check CHECK (entity_type IN ('shop','category'))`; `slug_redirects_old_slug_check CHECK (old_slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$')`.
- `slug_redirects_created_by_fkey FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE RESTRICT`.
- `entity_id` has no foreign key because it points at two tables. The alternative, a nullable `shop_id` and `category_id` with a CHECK that exactly one is set, was rejected to keep the agreed column set; the tradeoff is that only the action guarantees the target exists. The slug-change actions insert the redirect in the same transaction as the rename, and T-SHOP-104 (proposed) checks that every redirect resolves.
- Application-enforced: a new or changed slug may not equal an `old_slug` of the same entity type that points at a different entity. Renaming an entity back to one of its own old slugs deletes that redirect row in the same transaction; this is the only delete.

**Indexes.** The primary key serves the fallback lookup when a slug is not found: `WHERE entity_type = 'shop' AND old_slug = ?`, then 301 to the entity's current slug. Every old slug points directly at the entity, so there are no redirect chains.

**Lifecycle and retention.** Inserted on each slug change. Kept indefinitely, because links shared years ago should still work.

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
- `categories_slug_key UNIQUE (slug)`; `categories_slug_check CHECK (slug::text ~ '^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$')`.
- `categories_parent_name_key UNIQUE NULLS NOT DISTINCT (parent_id, name)`: "T-Shirts" may exist under two parents but not twice under one, and not twice at top level. Without `NULLS NOT DISTINCT`, nulls count as distinct in a unique constraint, so two top-level rows with the same name would pass [Verified-doc <https://www.postgresql.org/docs/18/sql-createtable.html>].
- `categories_path_key UNIQUE (path)`; `categories_path_check CHECK (path ~ '^/([a-z0-9]+(-[a-z0-9]+)*/)+$')`.
- `categories_depth_check CHECK (depth BETWEEN 1 AND 4 AND (parent_id IS NULL) = (depth = 1))`; `categories_not_own_parent_check CHECK (parent_id IS NULL OR parent_id <> id)`.
- Seeder-enforced, because they span rows: `path` = parent's `path` + `slug` + `/`, and `depth` = parent's `depth` + 1, computed top-down, which also makes a cycle impossible; a category that has products cannot receive a child or be deactivated until its products move ([04 §3.6](04-domain-model-and-data-dictionary.md)); a slug or parent change rewrites the paths of the whole subtree in one statement (`UPDATE categories SET path = :new || substr(path, length(:old) + 1) WHERE path LIKE :old || '%'`), inserts a `slug_redirects` row and queues `catalog.rebuild-listings`.

**Indexes.** Unique indexes only. The tree has on the order of 100 rows and is loaded whole by `catalog/queries.ts categoryTree()` and cached in each process until the next deploy or seeder run. Subtree and ancestor queries run against that cache, or against `product_listings.category_path` (§7.12).

**Lifecycle and retention.** Reference: never deleted, deactivated with `is_active = false`. Kept indefinitely; order lines keep their own `category_path_snapshot` (§11.3).

### 7.2 `attributes`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Platform-defined properties (`audience`, `material`, `apparel_size`, `shoe_size_eu`, `waist_size_in`, `color`; catalogue in [04 §21.2](04-domain-model-and-data-dictionary.md)).

| Column                     | Type        | Null | Default    | Notes                                                                                             |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                   |
| `code`                     | text        | no   | App        | Immutable: used in option signatures and filter URLs                                              |
| `name`                     | text        | no   | App        | Display name                                                                                      |
| `scope`                    | text        | no   | App        | `product` (values in `product_attribute_values`) or `variant` (values in `variant_option_values`) |
| `input`                    | text        | no   | App        | `single` or `multi`                                                                               |
| `is_filterable`            | boolean     | no   | `false`    | Shown as a storefront filter                                                                      |
| `position`                 | smallint    | no   | `0`        | Filter and form order                                                                             |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                   |

**Keys and constraints.** `attributes_pkey PRIMARY KEY (id)`; `attributes_code_key UNIQUE (code)`; `attributes_code_check CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$')`; `attributes_scope_check CHECK (scope IN ('product','variant'))`; `attributes_input_check CHECK (input IN ('single','multi'))`; `attributes_variant_single_check CHECK (scope <> 'variant' OR input = 'single')`, because a variant has exactly one value per axis.

**Indexes.** `attributes_code_key` maps filter parameters and seeder rows to IDs. The table (about 10 rows) is cached with the category tree.

**Lifecycle and retention.** Reference; never deleted or renamed by code. Kept indefinitely.

### 7.3 `attribute_values`

**Module** `catalog` · **Release** R1 · **Shop scope** none · **Lifecycle** Reference · **Sensitivity** Public

Allowed values of each attribute, unique per attribute rather than globally (fixes F12: shoe size 40 and waist 40 can coexist).

| Column                     | Type        | Null | Default    | Notes                                                                                       |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                             |
| `attribute_id`             | uuid        | no   | App        |                                                                                             |
| `code`                     | text        | no   | App        | Immutable; `m`, `42`, `42-5`, `black`                                                       |
| `label`                    | text        | no   | App        | `M`, `42`, `42.5`, `Black`                                                                  |
| `position`                 | smallint    | no   | `0`        | Picker and filter order (XS before S)                                                       |
| `swatch_hex`               | text        | yes  |            | `color` only; null draws a pattern chip ([04 §3.9](04-domain-model-and-data-dictionary.md)) |
| `is_active`                | boolean     | no   | `true`     | Inactive values leave pickers; existing products keep them                                  |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                             |

**Keys and constraints.** `attribute_values_pkey PRIMARY KEY (id)`; `attribute_values_attribute_fkey FOREIGN KEY (attribute_id) REFERENCES attributes (id) ON DELETE RESTRICT`; `attribute_values_attribute_code_key UNIQUE (attribute_id, code)`; `attribute_values_id_attribute_id_key UNIQUE (id, attribute_id)`, the target of the "value belongs to attribute" composite keys ([04 §2.5](04-domain-model-and-data-dictionary.md)); `attribute_values_code_check CHECK (code ~ '^[a-z0-9]+(?:[-_][a-z0-9]+)*$' AND char_length(code) <= 40)`; `attribute_values_label_check CHECK (char_length(label) BETWEEN 1 AND 40)`; `attribute_values_swatch_check CHECK (swatch_hex ~ '^#[0-9a-f]{6}$')`. That swatches appear only on `color` values is a seeder rule.

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

**Indexes.** Primary key only; the table (a few hundred rows at most) is cached with the tree, and the query above runs against the cache in production and against the database in T-CAT-104.

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

**Keys and constraints.** `brands_pkey PRIMARY KEY (id)`; `brands_slug_key UNIQUE (slug)`; `brands_slug_check` with the shop slug pattern; `brands_name_lower_key UNIQUE (lower(name))` (unique index); `brands_name_check CHECK (char_length(name) BETWEEN 1 AND 80)`; `brands_status_check CHECK (status IN ('active','pending','rejected'))`.

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
| `description`              | text        | yes  |            | Up to 5,000 characters [Assumption]; required at submit                                                                      |
| `category_id`              | uuid        | no   | App        | A leaf ([04 §3.6](04-domain-model-and-data-dictionary.md))                                                                   |
| `brand_id`                 | uuid        | yes  |            | Null = own label ([04 §3.10](04-domain-model-and-data-dictionary.md))                                                        |
| `manufacturer_name`        | text        | yes  |            | s6 "producer"; required at submit                                                                                            |
| `is_imported`              | boolean     | no   | `false`    |                                                                                                                              |
| `country_of_origin`        | char(2)     | yes  |            | ISO 3166-1 alpha-2; required when imported                                                                                   |
| `warranty_text`            | text        | yes  |            | Warranty or guarantee terms, or "No warranty"; required at submit                                                            |
| `care_and_precautions`     | text        | yes  |            | s6 "usage precautions"; required at submit                                                                                   |
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
- `products_slug_check CHECK (char_length(slug) BETWEEN 1 AND 80 AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')`; `products_title_check CHECK (char_length(title) BETWEEN 3 AND 120)`; `products_description_check CHECK (description IS NULL OR char_length(description) <= 5000)`.
- `products_status_check CHECK (status IN ('draft','pending_review','published','unpublished','rejected','archived','blocked'))`.
- `products_country_check CHECK (country_of_origin ~ '^[A-Z]{2}$' AND is_imported = (country_of_origin <> 'NP'))`: when a country is given, an imported product names a country other than `NP` and a domestic one names `NP`. A null country passes here and is caught by the disclosure check below.
- `products_disclosures_check CHECK (status NOT IN ('pending_review','published','unpublished') OR (description IS NOT NULL AND manufacturer_name IS NOT NULL AND warranty_text IS NOT NULL AND care_and_precautions IS NOT NULL AND (NOT is_imported OR country_of_origin IS NOT NULL)))`. The action returns a 422 listing every missing field first (AC-FR-CAT-005-2); this CHECK is the backstop that also stops an edit from blanking a disclosure on a live product. T-CAT-105 (proposed).
- `products_published_at_check CHECK (status <> 'published' OR (published_at IS NOT NULL AND first_published_at IS NOT NULL))`; `products_rejection_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`; `products_submitted_check CHECK (status <> 'pending_review' OR submitted_at IS NOT NULL)`.
- Application-enforced, because they need other rows: leaf category (T-CAT-101); the attribute rules of [04 §3.7](04-domain-model-and-data-dictionary.md); the publication gate (active shop with an accepted agreement, at least one `ready` image, at least one active variant and every active variant priced above zero, shipping configured, AC-FR-CAT-005-2); brands with `requires_moderation` forcing `pending_review` even in `post` mode; a `blocked` product cannot be edited, unpublished or restored by the shop.

**Indexes**

| Index                                                                                 | Query it serves                                                                                                                |
| ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `products_public_id_key`                                                              | Product page `/p/{slug}-{publicId}` and `getProduct`: `WHERE public_id = ?`, then visibility check and 301 if the slug differs |
| `products_seller_list_idx ON (shop_id, status, updated_at DESC, id)`                  | Seller product list `listShopProducts`: `WHERE shop_id = ? AND status = ? ORDER BY updated_at DESC, id` with cursor pagination |
| `products_moderation_queue_idx ON (submitted_at, id) WHERE status = 'pending_review'` | `listModerationQueue`, oldest first (AC-FR-CAT-006-1)                                                                          |
| `products_category_idx ON (category_id)`                                              | Seeder guard "does this category have products?" and the admin catalog view                                                    |
| `products_brand_idx ON (brand_id) WHERE brand_id IS NOT NULL`                         | Re-queueing a brand's products when `requires_moderation` is switched on, and brand usage before a brand is rejected           |

Storefront listing and search read `product_listings` (§7.12), not this table.

**Lifecycle and retention.** Created as `draft` with its default variant by `createProduct` (idempotent, AC-FR-CAT-003-3). Status changes are compare-and-set on `status` and `version`. There is no hard delete (AC-FR-CAT-007-3); `archived` hides a product from the default seller list. Order lines keep snapshots, so a product can change or be archived without altering history ([04 §2.13](04-domain-model-and-data-dictionary.md)). Kept as long as any order line or ledger entry references it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

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

**Keys and constraints.** `product_option_axes_pkey PRIMARY KEY (product_id, attribute_id)`, the target of `variant_option_values_axis_fkey`; `product_option_axes_position_key UNIQUE (product_id, position)`; `product_option_axes_position_check CHECK (position BETWEEN 1 AND 2)`; FKs to `products (id)` and `attributes (id)`, `ON DELETE RESTRICT`.

**Axes freeze.** Once any variant of the product has an inventory movement or an order line, its axis set is fixed. Such variants can only be archived, and their option values still reference the axes, so `RESTRICT` blocks removing an axis anyway. `replaceProductVariants` answers 409 with an explanation instead of letting the 23503 surface. Adding values on an existing axis (a new colour) is always allowed. To change axes later, the vendor archives the product and creates a new one.

**Indexes.** Primary key only (`WHERE product_id = ?`).

**Lifecycle and retention.** Replaced with the variant set by `replaceProductVariants` while the axes are not frozen. Kept while the product exists.

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
- `product_variants_price_check CHECK (price_minor BETWEEN 0 AND 100000000)`: at most Rs 10,00,000 [Assumption, AC-FR-CAT-004-3]. The upper bound catches unit mistakes, such as rupees multiplied by 100 twice, before they reach a cart. Zero is allowed only because a draft may not have a price yet; publication requires `price_minor > 0` on every active variant.
- `product_variants_compare_at_check CHECK (compare_at_price_minor IS NULL OR compare_at_price_minor > price_minor)`.
- `product_variants_weight_check CHECK (weight_grams IS NULL OR weight_grams BETWEEN 1 AND 50000)`.
- `product_variants_sku_check CHECK (char_length(sku) BETWEEN 1 AND 64 AND sku ~ '^[A-Za-z0-9][A-Za-z0-9._/-]*$')`.
- `product_variants_status_check CHECK (status IN ('active','archived'))`.
- `product_variants_default_signature_check CHECK (is_default = (option_signature = ''))`.
- `product_variants_signature_check CHECK (option_signature ~ '^([a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*(\|[a-z][a-z0-9_]*:[a-z0-9]+([-_][a-z0-9]+)*)*)?$')`.
- `product_variants_shop_sku_key UNIQUE (shop_id, sku) WHERE status = 'active'` (partial): two shops may use the same SKU (AC-FR-CAT-004-2), and an archived SKU can be reused.
- `product_variants_product_signature_key UNIQUE (product_id, option_signature) WHERE status = 'active'` (partial; [04 §3.5](04-domain-model-and-data-dictionary.md)).
- `product_variants_default_key UNIQUE (product_id) WHERE is_default AND status = 'active'` (partial).
- Application-enforced: every active variant of a product carries exactly the product's current axes (an active default next to axis variants is refused); at most 100 variants per product [Assumption, AC-FR-CAT-004-4]. T-CAT-106 (proposed).

**Indexes**

| Index                                                  | Query it serves                                                                                                                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `product_variants_product_idx ON (product_id, status)` | Variants of a product for the product page, the seller editor and listing refresh: `WHERE product_id = ? [AND status = 'active']` |
| `product_variants_shop_sku_key`                        | Seller inventory search by exact SKU: `WHERE shop_id = ? AND sku = ? AND status = 'active'`                                       |
| `product_variants_product_signature_key`               | The duplicate-combination guard itself                                                                                            |

**Lifecycle and retention.** Written by `replaceProductVariants` with `If-Match` on the product. A variant that was never stocked or ordered (no inventory movement, no order line) is hard-deleted together with its zero `inventory_items` row, and its option values cascade ([04 §2.6](04-domain-model-and-data-dictionary.md)). Any other variant is archived, which removes it from carts at the next revalidation; open orders keep their snapshots. Kept as long as order lines reference it ([04 §19.3](04-domain-model-and-data-dictionary.md)).

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
- `variant_option_values_variant_fkey FOREIGN KEY (variant_id, product_id) REFERENCES product_variants (id, product_id) ON DELETE CASCADE`: the only cascade in the catalog ([04 §2.6](04-domain-model-and-data-dictionary.md)).
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

**Lifecycle and retention.** Written with the variant in `replaceProductVariants`; removed only by the cascade from a hard-deleted draft variant. Kept while the variant exists.

### 7.11 `product_review_decisions`

**Module** `catalog` · **Release** R1 · **Shop scope** shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (reason and note are shown to the shop)

Moderation decisions (FR-CAT-006, AC-FR-CAT-006-5).

| Column        | Type        | Null | Default    | Notes                                          |
| ------------- | ----------- | ---- | ---------- | ---------------------------------------------- |
| `id`          | uuid        | no   | `uuidv7()` |                                                |
| `product_id`  | uuid        | no   | App        |                                                |
| `shop_id`     | uuid        | no   | App        |                                                |
| `decision`    | text        | no   | App        | `approved`, `rejected`, `blocked`, `unblocked` |
| `reason_code` | text        | yes  |            | Required for `rejected` and `blocked`          |
| `note`        | text        | yes  |            | Moderator's explanation to the shop            |
| `decided_by`  | uuid        | no   | App        | Staff user with `platform.products.moderate`   |
| `created_at`  | timestamptz | no   | `now()`    |                                                |

**Keys and constraints.** `product_review_decisions_pkey PRIMARY KEY (id)`; `product_review_decisions_product_fkey FOREIGN KEY (product_id, shop_id) REFERENCES products (id, shop_id) ON DELETE RESTRICT`; `product_review_decisions_decided_by_fkey` to `users (id) ON DELETE RESTRICT`; `product_review_decisions_decision_check CHECK (decision IN ('approved','rejected','blocked','unblocked'))`; `product_review_decisions_reason_code_check CHECK (reason_code IN ('counterfeit_suspected','misleading_claim','prohibited_item','missing_disclosure','poor_images','other'))`; `product_review_decisions_reason_required_check CHECK (decision NOT IN ('rejected','blocked') OR (reason_code IS NOT NULL AND note IS NOT NULL AND char_length(note) BETWEEN 10 AND 2000))`. Append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)).

**Indexes.** `product_review_decisions_product_idx ON (product_id, created_at DESC)`: moderation history in the seller product view and the moderation screen.

**Lifecycle and retention.** Inserted in the same transaction as the `products.status` change. Kept at least as long as the product row ([04 §19.3](04-domain-model-and-data-dictionary.md)), as evidence for complaints about counterfeit or misleading listings.

### 7.12 `product_listings` (read model)

**Module** `catalog` · **Release** R1 · **Shop scope** shop (denormalised) · **Lifecycle** Derived · **Sensitivity** Public

One row per product that is visible on the storefront: product `published`, shop `active`, at least one `ready` image and at least one active variant. A product that stops being visible loses its row. Storefront listings, filters and search read only this table (ADR-0014), one query per page, with no joins. Staleness of a few seconds is accepted; checkout re-reads the source tables (AC-FR-CAT-005-3).

| Column                               | Type                | Null | Default   | Notes                                                                                                                          |
| ------------------------------------ | ------------------- | ---- | --------- | ------------------------------------------------------------------------------------------------------------------------------ | --- | --------------------------------------------------------------- | --- | ---------------------------------------------- | --- | --- | --- | ------------------------- |
| `product_id`                         | uuid                | no   | App       | Primary key                                                                                                                    |
| `shop_id`, `shop_slug`, `shop_name`  | uuid, citext, text  | no   | App       | "Sold by" on cards; shop page filter                                                                                           |
| `public_id`, `slug`, `title`         | char(8), text, text | no   | App       | Card link and title                                                                                                            |
| `category_id`, `category_path`       | uuid, text          | no   | App       | Subtree filter by path prefix                                                                                                  |
| `category_names`                     | text                | no   | App       | Names along the path, for search                                                                                               |
| `brand_id`, `brand_name`             | uuid, text          | yes  |           | Brand filter and search                                                                                                        |
| `audience_value_ids`                 | uuid[]              | no   | `'{}'`    |                                                                                                                                |
| `size_value_ids`                     | uuid[]              | no   | `'{}'`    | Values of every size system, from active variants with available stock only, so "size M" matches only products with M in stock |
| `color_value_ids`                    | uuid[]              | no   | `'{}'`    | Same rule                                                                                                                      |
| `min_price_minor`, `max_price_minor` | bigint              | no   | App       | Over active variants                                                                                                           |
| `compare_at_price_minor`             | bigint              | yes  |           | Compare-at price of the cheapest variant, for the card                                                                         |
| `currency`                           | char(3)             | no   | `'NPR'`   |                                                                                                                                |
| `in_stock`                           | boolean             | no   | App       | Any active variant with `on_hand − reserved > 0`                                                                               |
| `primary_image_keys`                 | jsonb               | no   | App       | Derived image keys of position 1 ([04 §2.11](04-domain-model-and-data-dictionary.md))                                          |
| `published_at`                       | timestamptz         | no   | App       | "Newest" sort                                                                                                                  |
| `search_tsv`                         | tsvector            | no   | generated | `GENERATED ALWAYS AS (setweight(to_tsvector('simple', title), 'A')                                                             |     | setweight(to_tsvector('simple', coalesce(brand_name, '')), 'B') |     | setweight(to_tsvector('simple', category_names |     | ' ' |     | shop_name), 'C')) STORED` |
| `refreshed_at`                       | timestamptz         | no   | `now()`   |                                                                                                                                |

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

**Lifecycle and retention.** Recomputed from source tables by `catalog.refresh-listing` (one job per product, coalesced by `singletonKey`) after product, variant, inventory-availability, media and shop-status events, and fully by `catalog.rebuild-listings` nightly ([03 §9](03-system-architecture.md)). Replays are harmless because each run rewrites the whole row. Nothing is retained beyond visibility. T-CAT-108 (proposed): a row exists if and only if the product is visible, and two refreshes give the same row.

### 7.13 `media_assets`

**Module** `media` · **Release** R1 · **Shop scope** shop · **Lifecycle** Entity · **Sensitivity** Public (derived product, logo and banner images); Sensitive-personal (`kyc_document` originals)

Every uploaded file: product images, shop logos and banners, and KYC documents. The upload pipeline is in [03 §7.5](03-system-architecture.md) and ADR-0013. Only object keys are stored, never URLs (fixes F15's 255-character URLs and missing storage key).

| Column                     | Type        | Null | Default            | Notes                                                                                                                 |
| -------------------------- | ----------- | ---- | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()`         |                                                                                                                       |
| `shop_id`                  | uuid        | no   | App                | Uploads are always on behalf of a shop, including an applicant shop in `pending_review`                               |
| `kind`                     | text        | no   | App                | `product_image`, `shop_logo`, `shop_banner`, `kyc_document`                                                           |
| `document_type`            | text        | yes  |                    | KYC only: `business_registration_certificate`, `pan_vat_certificate`, `owner_identity_document`, `other` [Open OD-16] |
| `status`                   | text        | no   | `'pending_upload'` | `pending_upload`, `processing`, `ready`, `rejected`, `deleted`                                                        |
| `original_key`             | text        | no   | App                | `originals/<shop_id>/<id>` in the private bucket ([03 §3.5](03-system-architecture.md))                               |
| `derived_keys`             | jsonb       | yes  |                    | Width → public WebP key, for example `{"320": "p/<id>/<sha-prefix>-320.webp", …}`. Never set for KYC                  |
| `mime`                     | text        | no   | App                | Declared at creation; the worker rejects the file if its magic bytes disagree                                         |
| `bytes`                    | int         | no   | App                |                                                                                                                       |
| `width`, `height`          | int         | yes  |                    | Set by the worker for images                                                                                          |
| `sha256`                   | bytea       | yes  |                    | Of the original; set by the worker                                                                                    |
| `rejection_reason`         | text        | yes  |                    | Shown to the uploader                                                                                                 |
| `uploaded_by`              | uuid        | no   | App                |                                                                                                                       |
| `processed_at`             | timestamptz | yes  |                    |                                                                                                                       |
| `created_at`, `updated_at` | timestamptz | no   | `now()`            |                                                                                                                       |

**Keys and constraints**

- `media_assets_pkey PRIMARY KEY (id)`; `media_assets_id_shop_id_key UNIQUE (id, shop_id)` (targets for `shops.logo_media_id` and `banner_media_id`); `media_assets_id_shop_id_kind_key UNIQUE (id, shop_id, kind)` (target for `product_media`, §7.14); `media_assets_shop_fkey` to `shops (id)` and `media_assets_uploaded_by_fkey` to `users (id)`, `ON DELETE RESTRICT`.
- `media_assets_kind_check CHECK (kind IN ('product_image','shop_logo','shop_banner','kyc_document'))`; `media_assets_status_check CHECK (status IN ('pending_upload','processing','ready','rejected','deleted'))`.
- `media_assets_mime_check CHECK (mime IN ('image/jpeg','image/png','image/webp','application/pdf') AND (mime <> 'application/pdf' OR kind = 'kyc_document'))` (A-31; PDF for KYC only [Assumption, AC-FR-SHOP-014-3]).
- `media_assets_bytes_check CHECK (bytes BETWEEN 1 AND 10485760)` (10 MB).
- `media_assets_document_type_check CHECK ((kind = 'kyc_document') = (document_type IS NOT NULL) AND (document_type IS NULL OR document_type IN ('business_registration_certificate','pan_vat_certificate','owner_identity_document','other')))`.
- `media_assets_kyc_private_check CHECK (kind <> 'kyc_document' OR derived_keys IS NULL)`: a KYC document never gets a public derivative.
- `media_assets_ready_check CHECK (status <> 'ready' OR (sha256 IS NOT NULL AND processed_at IS NOT NULL AND (kind = 'kyc_document' OR (derived_keys IS NOT NULL AND width IS NOT NULL AND height IS NOT NULL))))`.
- `media_assets_rejected_check CHECK (status <> 'rejected' OR rejection_reason IS NOT NULL)`; `media_assets_sha256_check CHECK (sha256 IS NULL OR octet_length(sha256) = 32)`; `media_assets_derived_keys_check CHECK (derived_keys IS NULL OR jsonb_typeof(derived_keys) = 'object')`.
- Application-enforced: at most 5 KYC documents per shop (AC-FR-SHOP-014-3); upload creation limited to 120 per hour per shop (rate limiter, §15.4).

**Indexes**

| Index                                                                                    | Query it serves                                                                                      |
| ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `media_assets_shop_kind_idx ON (shop_id, kind, created_at DESC)`                         | Seller media picker (`kind = 'product_image'`) and the KYC document list for the owner and reviewers |
| `media_assets_cleanup_idx ON (created_at) WHERE status IN ('pending_upload','rejected')` | `media.cleanup-abandoned`: uploads never completed within 24 h, and originals of rejected files      |

**Lifecycle and retention.** `pending_upload` → `processing` → `ready` or `rejected`, each step a compare-and-set by the web process or the worker. `deleted` means the stored objects were removed and the row is kept as a tombstone. Derived public images are content-addressed and never overwritten; in R1 they are not deleted either, because order snapshots may point at them (§11.3). Originals of rejected or abandoned uploads are deleted after 24 hours. KYC originals are kept while the shop exists plus the retention period in [04 §19.3](04-domain-model-and-data-dictionary.md); for an application that is rejected and not resubmitted, they are deleted one year after the rejection [Assumption]. Every staff view of a KYC document is audited (AC-FR-SHOP-014-2). T-MED-001 covers file validation; T-MED-103 (proposed) checks that no code path produces a public key for a `kyc_document`.

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

- `collections`: `id uuid PK DEFAULT uuidv7()`, `slug citext UNIQUE` (shop slug pattern), `title text` (3–80), `description text NULL`, `status text` with `CHECK (status IN ('draft','published','archived'))`, `starts_at` and `ends_at timestamptz NULL` with `CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)`, `created_by uuid REFERENCES users ON DELETE RESTRICT`, `created_at`, `updated_at`.
- `collection_products`: `collection_id` and `product_id`, `PRIMARY KEY (collection_id, product_id)`, `position smallint NOT NULL`, `UNIQUE (collection_id, position)`, both FKs `ON DELETE RESTRICT`. Only products with a `product_listings` row are shown, so an archived product silently drops out without a delete.
- Index: `collection_products_product_idx ON (product_id)` for "collections this product is in" on the product page. Collection pages get a `collection_ids uuid[]` column on `product_listings` at the same time, so they stay single-table queries.

---

## 8. Inventory

The `inventory` module is the only writer of the three tables in this section ([03 §4.4](03-system-architecture.md#44-module-responsibilities), ADR-0008). Other modules call its actions (`reserveForOrder`, `commitHeld`, `releaseForOrderItems`, `consumeForShipment`, `restock`, `adjust`, `stocktake`, `correct`) inside their own transaction. How the rows move is specified in [05 §5](05-order-payment-and-inventory-lifecycles.md#5-inventory-reservations-and-movements) and the reservation state machine in [05 §6.9](05-order-payment-and-inventory-lifecycles.md#69-inventory-reservation). This section fixes the rows themselves.

`inventory_items` is the projection that checkout locks. `inventory_reservations` records who holds which units. `inventory_movements` is the append-only journal that explains every number. The invariants that tie them together (`on_hand = Σ on_hand_delta`, `reserved = Σ open reservations`) span rows, so no CHECK can express them. They are kept by writing the projection and its movement in one transaction and checked daily by the drift job ([05 §5.10](05-order-payment-and-inventory-lifecycles.md#510-drift-detection-and-repair)). The single-row invariants below are CHECK constraints.

**How to read the index tables in §8–§15.** Only the listed indexes are created. A foreign-key column gets its own index only when a named query needs it or when its parent rows can be deleted. Foreign keys to rows that are never deleted (users, shops, orders, stocked variants) never trigger a RESTRICT check, so an index would cost insert time for nothing.

### 8.1 inventory_items

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

`inventory_items_reserved_check` is the oversell backstop. Checkout's guard `WHERE on_hand - reserved >= :qty` ([05 §4.5](05-order-payment-and-inventory-lifecycles.md#45-the-conditional-stock-update)) is what normally refuses the last unit. If a future code path forgets that guard, the UPDATE fails with SQLSTATE 23514 and the transaction rolls back, so the promise is never stored. The cost is one comparison per update. T-INV-001 removes the guard in a test double and expects 23514. T-INV-003 proves the guarded path under concurrency. `int` holds 2.1 × 10^9 units per variant, far beyond any shop; only money uses `bigint`.

**Indexes.**

| Index                                    | Definition              | Query served                                                                                                                                                                     |
| ---------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_items_pkey`                   | `(variant_id)`          | Checkout reserve: `UPDATE … WHERE variant_id = :v AND shop_id = :s AND on_hand - reserved >= :q`; PDP availability: `WHERE variant_id = ANY(:ids)`; listing refresh (`in_stock`) |
| `inventory_items_variant_id_shop_id_key` | `(variant_id, shop_id)` | Foreign-key target only                                                                                                                                                          |

There is no `shop_id` index. The seller inventory page (`listInventory`) is driven by the products index `(shop_id, status, updated_at)` of §7.6 and joins here by primary key.

**Lifecycle and retention.** Created with the variant. Initial stock is entered as an `adjustment` movement with reason `received_stock`, so the journal sums are complete from the first unit ([05 §5.1](05-order-payment-and-inventory-lifecycles.md#51-model-and-invariants)). Archived variants keep their row, because a return or RTO can restock into it ([05 §5.7](05-order-payment-and-inventory-lifecycles.md#57-return-restock)). The one delete: when a never-stocked draft variant is hard-deleted ([04 §2.6](04-domain-model-and-data-dictionary.md), §7.9), its `(0, 0)` row is deleted first in the same transaction. Once any movement exists, the RESTRICT foreign key from §8.3 makes that delete fail. The row's history is retained in §8.3.

**Sensitivity.** Internal. Exact `on_hand` is shop-confidential. The storefront receives `in_stock` and, below a threshold, "only N left" ([08](08-ui-ux-and-design-system.md)).

### 8.2 inventory_reservations

**Module** `inventory` · **Release** R1 (`held` and `expires_at` used from R1.1) · **Shop scope** `shop_id`, composite FKs · **Lifecycle** Record · **Sensitivity** Internal

One row per order item, or per remainder after a partial release. COD reservations start `committed`. Gateway reservations start `held` with an expiry ([05 §5.3](05-order-payment-and-inventory-lifecycles.md#53-creating-reservations)).

| Column          | Type        | Null | Default    | Notes                                                                                                                                                                  |
| --------------- | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid        | no   | `uuidv7()` |                                                                                                                                                                        |
| `shop_id`       | uuid        | no   | App        | From the order item                                                                                                                                                    |
| `variant_id`    | uuid        | no   | App        |                                                                                                                                                                        |
| `order_id`      | uuid        | no   | App        | Lets cancellation and the expiry job find an order's holds under the parent-row lock                                                                                   |
| `order_item_id` | uuid        | no   | App        | NOT NULL here: every R1 and R1.1 reservation comes from an order item                                                                                                  |
| `quantity`      | int         | no   | App        | Never changes. A partial release marks the row `released` and inserts a new row for the remainder ([05 §5.5](05-order-payment-and-inventory-lifecycles.md#55-release)) |
| `status`        | text        | no   | App        | `held`, `committed`, `released`, `consumed`                                                                                                                            |
| `expires_at`    | timestamptz | yes  | —          | Only while `held`: provider session expiry + 10 minutes, capped at `orders.placed_at + 90 min` [Assumption, 05 §4.8]. Cleared on commit                                |
| `resolved_at`   | timestamptz | yes  | —          | Set on `released` or `consumed`                                                                                                                                        |
| `created_at`    | timestamptz | no   | `now()`    |                                                                                                                                                                        |
| `updated_at`    | timestamptz | no   | `now()`    | Trigger                                                                                                                                                                |

**Keys and constraints.**

```sql
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

The four-column foreign key targets `order_items_reservation_ref_key` (§11.3). One constraint proves that the reservation's order, shop and variant are exactly those of its order item. A reservation that holds shop B's variant against shop A's order line fails with SQLSTATE 23503 (T-ORD-104).

```sql
-- At most one open reservation per order item
CREATE UNIQUE INDEX inventory_reservations_open_item_key
  ON inventory_reservations (order_item_id) WHERE status IN ('held', 'committed');
```

The partial release of [05 §5.5](05-order-payment-and-inventory-lifecycles.md#55-release) releases the old row before it inserts the remainder. A bug that forgets the release gets 23505 instead of counting the same units twice in `reserved`. T-INV-102 (proposed).

**Indexes.**

| Index                                     | Definition                                                             | Query served                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_reservations_open_item_key`    | `(order_item_id) WHERE status IN ('held','committed')`                 | Shipment consume and item-level rejection: `WHERE order_item_id = ANY(:items) AND status IN ('held','committed')`                                                                                                                              |
| `inventory_reservations_open_order_idx`   | `(order_id) WHERE status IN ('held','committed')`                      | Release or commit for one order under the parent lock; the expiry job's `EXISTS (… WHERE r.order_id = p.order_id AND r.status = 'held' AND r.expires_at <= now())` ([05 §5.4](05-order-payment-and-inventory-lifecycles.md#54-expiration-job)) |
| `inventory_reservations_held_expiry_idx`  | `(expires_at) WHERE status = 'held'`                                   | Expiry job cases A and C: `WHERE status = 'held' AND expires_at <= :cutoff`                                                                                                                                                                    |
| `inventory_reservations_open_variant_idx` | `(variant_id) INCLUDE (quantity) WHERE status IN ('held','committed')` | Drift check: `SUM(quantity) … GROUP BY variant_id`, index-only                                                                                                                                                                                 |

All four are partial. Only open reservations are indexed, and after a few weeks almost every row is closed, so the indexes stay small no matter how many orders accumulate.

**Lifecycle and retention.** Inserted by checkout step 9 and by the late-capture re-reserve ([05 §8.4](05-order-payment-and-inventory-lifecycles.md#84-payment-success-after-reservation-expiry-r11)). Status changes only by compare-and-set. Never deleted. Retained with the order record for at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]), because it explains the stock history of a disputed order.

### 8.3 inventory_movements

**Module** `inventory` · **Release** R1 · **Shop scope** `shop_id`, composite FK · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal (`actor_user_id` is Personal when joined)

One row per change to `on_hand` or `reserved`, written in the same transaction as the change. Kinds, deltas and reason codes are listed in [05 §5.2](05-order-payment-and-inventory-lifecycles.md#52-movement-kinds). Rules in [05 §5.11](05-order-payment-and-inventory-lifecycles.md#511-rules-for-inventory_movements).

| Column           | Type        | Null | Default    | Notes                                                                                                                                                         |
| ---------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | no   | `uuidv7()` | Time-ordered; tie-breaker for history pages                                                                                                                   |
| `shop_id`        | uuid        | no   | App        |                                                                                                                                                               |
| `variant_id`     | uuid        | no   | App        |                                                                                                                                                               |
| `kind`           | text        | no   | App        | `reserve`, `release`, `commit`, `ship`, `return_restock`, `rto_restock`, `adjustment`, `stocktake`, `correction`                                              |
| `on_hand_delta`  | int         | no   | App        | Signed                                                                                                                                                        |
| `reserved_delta` | int         | no   | App        | Signed                                                                                                                                                        |
| `reason_code`    | text        | no   | App        | Vocabulary per kind in `app/modules/inventory/domain/movement_reasons.ts`; vendors see a label                                                                |
| `note`           | text        | yes  | —          | Vendor or admin text, at most 500 characters                                                                                                                  |
| `actor_user_id`  | uuid        | yes  | —          | The person who caused it; null for jobs                                                                                                                       |
| `reference_type` | text        | no   | App        | `inventory_reservation`, `shipment`, `return_request`, `request`, `audit_log`                                                                                 |
| `reference_id`   | text        | no   | App        | The referenced row's id as text: a UUID, or the `audit_logs.id` bigint for `correction`. For `request` it is the `idempotency_keys.id` of the adjustment call |
| `request_id`     | text        | yes  | —          | `X-Request-Id` or the job's correlation id                                                                                                                    |
| `created_at`     | timestamptz | no   | `now()`    |                                                                                                                                                               |

`reference_id` is polymorphic, so it has no foreign key. The two CHECKs below and the exactly-once index do the work a foreign key cannot.

**Keys and constraints.**

```sql
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
CONSTRAINT inventory_movements_reason_code_check CHECK (reason_code ~ '^[a-z][a-z_]{2,39}$'),
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

pg-boss may run a job twice [Verified-doc <https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md>], and a vendor on a slow connection may submit "returned to origin" twice. The stock effect must still happen once. With this index a second restock for the same shipment and variant fails with 23505, the action treats that as "already done" and the transaction rolls back cleanly. It relies on one order line per variant per shop order (`order_items_shop_order_variant_key`, §11.3). Adjustments and stocktakes are excluded because their idempotency key already protects them. The append-only triggers of [04 §2.12](04-domain-model-and-data-dictionary.md) apply. Tests: T-INV-006 (append-only), T-INV-101 (proposed: delta CHECK per kind, exactly-once restock).

**Indexes.**

| Index                                     | Definition                                                                       | Query served                                                                                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `inventory_movements_variant_history_idx` | `(variant_id, created_at DESC, id DESC) INCLUDE (on_hand_delta, reserved_delta)` | Vendor stock history: `WHERE variant_id = :v AND shop_id = :s ORDER BY created_at DESC, id DESC LIMIT 50`; drift check sums per variant as an index-only scan |
| `inventory_movements_reference_once_key`  | above                                                                            | Exactly-once guard; "was this return already restocked": `WHERE reference_type = 'return_request' AND reference_id = :r`                                      |

**Lifecycle and retention.** Insert-only. Volume at the 10× design load of A-02 (20,000 orders a month, about 2 lines each, about 3 movements per line) is roughly 120,000 rows a month, about 7 million in five years. That needs no partitioning. Retained for at least 6 years with the order records they explain ([05 §5.11](05-order-payment-and-inventory-lifecycles.md#511-rules-for-inventory_movements), [04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]). Only the retention maintenance command deletes rows ([04 §2.12](04-domain-model-and-data-dictionary.md)).

---

## 9. Logistics and locations

The `logistics` module owns the national location reference data and each shop's delivery configuration. The address tables that use the codes are §5.5 (`user_addresses`) and §6.6 (`shop_addresses`). The seed dataset and its source are [04 §21.4](04-domain-model-and-data-dictionary.md) and [04 §21.5](04-domain-model-and-data-dictionary.md).

**Codes.** Nepal Post's federal postal codes give every local level a 5-digit code made of a province digit, a 2-digit district number and a 2-digit local-level number, and every ward a 7-digit code (the local-level code plus a 2-digit ward). Kathmandu Metropolitan City is `30608`, with wards `3060801` to `3060832` [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/Postal%20Code_wteggid.pdf>]. DripNepal uses the first digit as the province code and the first three digits as the district code (`3` Bagmati, `306` Kathmandu, `307` Bhaktapur, `308` Lalitpur). A CHECK then proves that every code sits inside its parent. The counts to seed are 7 provinces, 77 districts and 753 local levels with 6,743 wards (canon §17.8). Whether this list is the authoritative dataset to build on is [Verify-external VX-10].

**Why codes as primary keys.** The code is what seeders, address snapshots and API filters (`?province=3`) use, and it does not change ([04 §2.1](04-domain-model-and-data-dictionary.md)). Codes are `text`, not integers, because they are identifiers with positional meaning, not numbers.

**Changes.** If the government merges or renames a local level, the new code is inserted and the old row gets `is_active = false`. Saved addresses that use the old code stay valid (RESTRICT), and order snapshots already carry the names.

The location tables are tiny (at most 753 rows in a handful of 8 KB pages). They have no secondary indexes: at this size a sequential scan is as fast as an index lookup, and the index would only add maintenance.

### 9.1 provinces

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

### 9.2 districts

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
CONSTRAINT districts_code_check CHECK (code ~ '^[1-7][0-9]{2}$'),
CONSTRAINT districts_code_prefix_check CHECK (left(code, 1) = province_code),
CONSTRAINT districts_province_fkey FOREIGN KEY (province_code) REFERENCES provinces (code) ON DELETE RESTRICT,
CONSTRAINT districts_code_province_code_key UNIQUE (code, province_code)   -- target of address composite FKs (04 §2.5)
```

**Indexes.** Primary key and the unique key. `listDistricts?province=` scans 77 rows.

**Lifecycle and retention.** As §9.1.

### 9.3 local_levels

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

### 9.4 delivery_zones

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

### 9.5 delivery_zone_districts

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

"At most one zone" is the unique key. "At least one zone" cannot be a constraint on this table, so the reference-data test T-SHOP-102 (proposed) asserts that every active district has exactly one zone after seeding.

**Indexes.** `delivery_zone_districts_district_key` serves the checkout zone lookup `SELECT zone_code … WHERE district_code = :d`.

**Lifecycle and retention.** Moving a district to another zone changes fees for future quotes only. Placed shop orders keep their fee and zone snapshot (§11.2).

### 9.6 shop_delivery_coverage

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

**Lifecycle and retention.** `replaceShopShipping` (⟳, `If-Match` on `shops.version`) deletes and re-inserts the shop's coverage and rates in one transaction and writes one `audit_logs` row with the before and after sets. Hard delete is allowed ([04 §2.6](04-domain-model-and-data-dictionary.md)). Open orders are unaffected because their fee and zone are snapshotted. The cross-table rule "every covered district's zone has a rate" is checked by `replaceShopShipping`, and checkout treats a missing rate as `DELIVERY_NOT_AVAILABLE` rather than free delivery ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order)). T-SHOP-103 (proposed).

### 9.7 shop_shipping_rates

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

### 10.1 carts

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
| `carts_expiry_idx`       | `(expires_at) WHERE status = 'active'`  | `cart.expire-abandoned` ([03 §9](03-system-architecture.md#9-asynchronous-work)): `UPDATE … SET status = 'abandoned' WHERE status = 'active' AND expires_at < now()` |
| `carts_purge_idx`        | `(updated_at) WHERE status <> 'active'` | Purge: `DELETE FROM carts WHERE status <> 'active' AND updated_at < now() - interval '30 days'`                                                                      |

**Merge on login** (AC-FR-CART-001-3). In one transaction, both carts are locked `FOR UPDATE` in `id` order. Each guest line is upserted into the user's cart with `quantity = LEAST(10, a + b)`, within the 50-line cap, and the guest cart becomes `merged`. A second login finds no active guest cart, so merging is idempotent. If the user has no active cart, the guest cart is adopted instead: `user_id` is set and `guest_token_hash` cleared.

**Lifecycle and retention.** `converted` in the checkout transaction, `abandoned` by the expiry job, `merged` at login. Hard-deleted 30 days after leaving `active` [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)], with `cart_items` cascading ([04 §2.6](04-domain-model-and-data-dictionary.md)). No order references a cart, so the purge never touches history.

### 10.2 cart_items

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
CONSTRAINT cart_items_cart_fkey FOREIGN KEY (cart_id) REFERENCES carts (id) ON DELETE CASCADE,
CONSTRAINT cart_items_variant_fkey FOREIGN KEY (variant_id)
  REFERENCES product_variants (id) ON DELETE RESTRICT,
CONSTRAINT cart_items_cart_variant_key UNIQUE (cart_id, variant_id),
CONSTRAINT cart_items_quantity_check CHECK (quantity BETWEEN 1 AND 10),
CONSTRAINT cart_items_unit_price_check CHECK (unit_price_minor_at_add >= 0),
CONSTRAINT cart_items_currency_check CHECK (currency = 'NPR')
```

Adding a variant already in the cart is an upsert: `INSERT … ON CONFLICT (cart_id, variant_id) DO UPDATE SET quantity = LEAST(10, cart_items.quantity + EXCLUDED.quantity)`. The 50-line cap is checked by `addCartItem` after it locks the cart row, which already serialises writers, so no trigger is needed. Over the cap the API answers 422. T-CART-102 (proposed). There is no `shop_id` column: it would be a second copy of the variant's shop that checkout must not trust anyway.

**Indexes.** `cart_items_cart_variant_key` serves cart load (`WHERE cart_id = :c`) and the upsert. There is no `variant_id` index: a cart line always points at a variant of a published product, and such variants are archived, never deleted (§7.9).

**Lifecycle and retention.** Deleted by `removeCartItem`, or with the cart.

---

## 11. Orders, fulfillment and returns

The `orders` module owns these tables. The multi-shop model, the "as placed versus effective" amounts and the cumulative allocation rule are in [05 §3](05-order-payment-and-inventory-lifecycles.md#3-the-multi-shop-order-model). The state machines are in [05 §6](05-order-payment-and-inventory-lifecycles.md#6-state-machines). Three rules apply to every table here.

**Human numbers** follow [04 §2.1](04-domain-model-and-data-dictionary.md): `DN-XXXXXXX`, `DN-XXXXXXX-n`, `RT-XXXXXXX`.

**Access.** Customer queries include `customer_user_id = :auth_user` and seller queries `shop_id = :resolved_shop` in the SQL itself (canon §7). A miss returns 404 (T-SEC-001, T-SEC-002).

**Amounts and snapshots are written once.** [05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective) states that order amounts are stored as placed and never rewritten. A trigger makes that a database guarantee instead of a code-review item:

```sql
-- Rejects an UPDATE that changes any column not named in the trigger arguments
CREATE FUNCTION allow_only_columns() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - TG_ARGV) IS DISTINCT FROM (to_jsonb(OLD) - TG_ARGV) THEN
    RAISE EXCEPTION 'on % only % may change', TG_TABLE_NAME, TG_ARGV USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
```

`to_jsonb(row) - text[]` drops the allowed columns and compares the rest. The cost is one row-to-JSON conversion per update, a few microseconds, on rows that change a handful of times in their life. Referential actions fire the trigger too, which is why `orders` lists `idempotency_key_id` (set to null by `ON DELETE SET NULL`, [04 §2.6](04-domain-model-and-data-dictionary.md)). The migrator role can still disable the trigger for the retention purge ([04 §2.12](04-domain-model-and-data-dictionary.md)). T-ORD-101 (proposed) tries to change every non-allowed column of each guarded table and expects SQLSTATE P0001.

### 11.1 orders

**Module** `orders` · **Release** R1 · **Shop scope** none (parent of shop-scoped rows; customer-scoped) · **Lifecycle** Record · **Sensitivity** Personal; Sensitive-personal members of `shipping_address` are encrypted; totals are Financial

The checkout the customer sees as "my order DN-4K7Q2M9": who ordered, how they pay, the totals as placed and the delivery address as it was. The parent status is derived from the shop orders ([05 §3.8](05-order-payment-and-inventory-lifecycles.md#38-parent-status-derivation)). This table replaces the current `orders`, which cascades from users and addresses (RF-06), mixes shops (RF-07) and has no idempotency (RF-15).

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                    |
| -------------------------- | ----------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                       | uuid        | no   | `uuidv7()` | Supplied by the action so that step 8 can run before the insert ([05 §4.3](05-order-payment-and-inventory-lifecycles.md#43-step-by-step))                |
| `number`                   | text        | no   | App        | `DN-` + 7 Crockford base32 characters                                                                                                                    |
| `customer_user_id`         | uuid        | no   | App        | The signed-in customer                                                                                                                                   |
| `status`                   | text        | no   | App        | `awaiting_payment`, `placed`, `in_progress`, `completed`, `cancelled`. Written only by `recomputeOrderStatus`, in the transaction of a shop order change |
| `payment_method`           | text        | no   | App        | `cod`, `esewa`, `khalti`. All three are in the CHECK from the baseline. The API offers only the enabled methods (R1: `cod`)                              |
| `currency`                 | char(3)     | no   | `'NPR'`    |                                                                                                                                                          |
| `items_subtotal_minor`     | bigint      | no   | App        | Σ `shop_orders.items_subtotal_minor`                                                                                                                     |
| `shipping_total_minor`     | bigint      | no   | App        | Σ `shop_orders.shipping_fee_minor`                                                                                                                       |
| `discount_total_minor`     | bigint      | no   | `0`        | Σ `shop_orders.discount_minor`; 0 in R1 ([05 §3.4](05-order-payment-and-inventory-lifecycles.md#34-discount-allocation))                                 |
| `grand_total_minor`        | bigint      | no   | App        | As placed. The request's `expected_grand_total_minor` is only compared with it (`PRICE_CHANGED`), never stored                                           |
| `shipping_address`         | jsonb       | no   | App        | Snapshot; shape below                                                                                                                                    |
| `shipping_district_code`   | text        | no   | App        | Copy of the snapshot's district for zone reports and filters                                                                                             |
| `customer_email_snapshot`  | text        | no   | App        | The account email at placement, for receipts and support                                                                                                 |
| `customer_note`            | text        | yes  | —          | At most 500 characters                                                                                                                                   |
| `placed_at`                | timestamptz | no   | `now()`    |                                                                                                                                                          |
| `idempotency_key_id`       | uuid        | yes  | —          | The key row of the placing request; null once the key is purged                                                                                          |
| `request_id`               | text        | yes  | —          | `X-Request-Id` of the placing request                                                                                                                    |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                          |

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
- **Vendor visibility.** The packing view decrypts the recipient fields for the shop's own shop order while it is non-terminal and for 30 days after (A-18, [Open OD-17]). After that the API masks them ([07](07-security-threat-model-and-permissions.md)). The ciphertext stays for the retention period. What account anonymisation does to it is [04 §19.2](04-domain-model-and-data-dictionary.md).

**Keys and constraints.**

```sql
CONSTRAINT orders_number_key UNIQUE (number),
CONSTRAINT orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}$'),
CONSTRAINT orders_id_customer_user_id_key UNIQUE (id, customer_user_id),   -- target for §11.7, §14.1
CONSTRAINT orders_customer_fkey FOREIGN KEY (customer_user_id) REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT orders_status_check
  CHECK (status IN ('awaiting_payment', 'placed', 'in_progress', 'completed', 'cancelled')),
CONSTRAINT orders_payment_method_check CHECK (payment_method IN ('cod', 'esewa', 'khalti')),
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
CONSTRAINT orders_shipping_district_fkey FOREIGN KEY (shipping_district_code)
  REFERENCES districts (code) ON DELETE RESTRICT,
CONSTRAINT orders_customer_note_check CHECK (customer_note IS NULL OR char_length(customer_note) <= 500),
CONSTRAINT orders_request_id_check CHECK (request_id IS NULL OR request_id ~ '^[A-Za-z0-9-]{8,64}$'),
CONSTRAINT orders_idempotency_key_fkey FOREIGN KEY (idempotency_key_id)
  REFERENCES idempotency_keys (id) ON DELETE SET NULL

CREATE TRIGGER orders_guard BEFORE UPDATE ON orders FOR EACH ROW
  EXECUTE FUNCTION allow_only_columns('status', 'updated_at', 'idempotency_key_id',
    'shipping_address', 'customer_email_snapshot', 'customer_note');   -- the last three for 04 §19.2 only
```

`orders_totals_check` is the grand-total arithmetic invariant. The cross-row sums (parent equals the sum of its shop orders) cannot be CHECKs. They are asserted by the checkout action before commit and by the nightly integrity job ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)). T-ORD-102 (proposed) inserts rows that break each CHECK and expects 23514.

**Indexes.**

| Index                            | Definition                                                                                | Query served                                                                                                                             |
| -------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `orders_number_key`              | `(number)`                                                                                | Order by number: `getMyOrder` (with `customer_user_id = :u`), `adminGetOrder`, support phone lookups                                     |
| `orders_customer_list_idx`       | `(customer_user_id, placed_at DESC, id DESC)`                                             | `listMyOrders`: `WHERE customer_user_id = :u ORDER BY placed_at DESC, id DESC` (cursor)                                                  |
| `orders_admin_status_idx`        | `(status, placed_at DESC, id DESC)`                                                       | `adminListOrders` filtered by status                                                                                                     |
| `orders_admin_recent_idx`        | `(placed_at DESC, id DESC)`                                                               | `adminListOrders` unfiltered; "orders placed today" between two Kathmandu midnights ([04 §2.2](04-domain-model-and-data-dictionary.md))  |
| `orders_cod_open_idx`            | `(customer_user_id) WHERE payment_method = 'cod' AND status IN ('placed', 'in_progress')` | COD limit at checkout step 7: `count(*) … WHERE customer_user_id = :u AND payment_method = 'cod' AND status IN ('placed','in_progress')` |
| `orders_idempotency_key_idx`     | `(idempotency_key_id) WHERE idempotency_key_id IS NOT NULL`                               | The `SET NULL` action run by the hourly key purge. Without it, every purged key scans `orders`                                           |
| `orders_id_customer_user_id_key` | `(id, customer_user_id)`                                                                  | Foreign-key target only                                                                                                                  |

**Lifecycle and retention.** Inserted once by `placeOrder`. Afterwards only `status` changes (and, under [04 §19.2](04-domain-model-and-data-dictionary.md), the personal snapshot fields). Never deleted inside the retention period: at least 6 years after the end of the fiscal year in which the order's last shop order became terminal (VAT Rules 2053 r23(7) requires 6 years; E-Commerce Directive 2082 s14 at least 5 [Verify-external VX-08]; [04 §19.3](04-domain-model-and-data-dictionary.md)).

### 11.2 shop_orders

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial, Internal

What a vendor accepts, ships and is settled for: one row per shop per order. Its status machine is [05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder).

| Column                                                       | Type        | Null | Default    | Notes                                                                                                                                                                                                |
| ------------------------------------------------------------ | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                         | uuid        | no   | `uuidv7()` |                                                                                                                                                                                                      |
| `order_id`                                                   | uuid        | no   | App        |                                                                                                                                                                                                      |
| `shop_id`                                                    | uuid        | no   | App        | From the cart line's variant, never from input                                                                                                                                                       |
| `number`                                                     | text        | no   | App        | Parent number + `-` + position ([04 §2.1](04-domain-model-and-data-dictionary.md))                                                                                                                   |
| `status`                                                     | text        | no   | App        | `awaiting_payment`, `awaiting_acceptance`, `accepted`, `completed`, `cancelled`, `rejected`                                                                                                          |
| `cancel_reason`                                              | text        | yes  | —          | `customer_cancelled`, `payment_expired`, `acceptance_timeout`, `admin_cancelled`, `shop_frozen`, `undeliverable`, `stock_unavailable_after_payment`                                                  |
| `rejection_reason`                                           | text        | yes  | —          | Whole rejection: `out_of_stock`, `cannot_fulfil`, `pricing_error`, `other` ([05 §6.1](05-order-payment-and-inventory-lifecycles.md#61-shoporder)). Item-level reasons go into the `order_events` row |
| `currency`                                                   | char(3)     | no   | `'NPR'`    |                                                                                                                                                                                                      |
| `items_subtotal_minor`                                       | bigint      | no   | App        | Σ `order_items.line_subtotal_minor`                                                                                                                                                                  |
| `shipping_fee_minor`                                         | bigint      | no   | App        | The shop's zone rate at checkout, fixed from then on ([05 §3.3](05-order-payment-and-inventory-lifecycles.md#33-shipping-fee-per-shop-order))                                                        |
| `discount_minor`                                             | bigint      | no   | `0`        | Σ `order_items.discount_minor`                                                                                                                                                                       |
| `total_minor`                                                | bigint      | no   | App        | As placed                                                                                                                                                                                            |
| `commission_total_minor`                                     | bigint      | no   | App        | Σ `order_items.commission_minor`                                                                                                                                                                     |
| `delivery_zone_code_snapshot`                                | text        | no   | App        | Zone that priced the fee                                                                                                                                                                             |
| `est_min_days_snapshot`, `est_max_days_snapshot`             | smallint    | no   | App        | The delivery promise shown at checkout. E-Commerce Act s9(1) requires delivery within the stated period [Verify-external VX-02], so the promise is kept as evidence                                  |
| `shop_name_snapshot`                                         | text        | no   | App        | Shop name at placement, for receipts                                                                                                                                                                 |
| `acceptance_due_at`                                          | timestamptz | yes  | —          | `now() + vendor_acceptance_sla_hours` on entering `awaiting_acceptance`                                                                                                                              |
| `accepted_at`, `completed_at`, `cancelled_at`, `rejected_at` | timestamptz | yes  | —          | Set by the transition that reaches the state                                                                                                                                                         |
| `version`                                                    | int         | no   | `1`        | [04 §2.10](04-domain-model-and-data-dictionary.md)                                                                                                                                                   |
| `created_at`, `updated_at`                                   | timestamptz | no   | `now()`    |                                                                                                                                                                                                      |

**Keys and constraints.**

```sql
CONSTRAINT shop_orders_number_key UNIQUE (number),
CONSTRAINT shop_orders_number_check CHECK (number ~ '^DN-[0-9A-HJKMNP-TV-Z]{7}-[1-9][0-9]?$'),
CONSTRAINT shop_orders_id_shop_id_key UNIQUE (id, shop_id),        -- target for §11.3, §11.5, §11.7, §12.4, §13.1
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
CONSTRAINT shop_orders_cancelled_check
  CHECK ((status = 'cancelled') = (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)),
CONSTRAINT shop_orders_rejected_check
  CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL AND rejected_at IS NOT NULL)),
CONSTRAINT shop_orders_accepted_check CHECK (status NOT IN ('accepted', 'completed') OR accepted_at IS NOT NULL),
CONSTRAINT shop_orders_completed_check CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
CONSTRAINT shop_orders_acceptance_due_check
  CHECK (status <> 'awaiting_acceptance' OR acceptance_due_at IS NOT NULL),
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

`shop_orders_order_shop_key` makes the split exact: a bug that creates two shop orders for the same shop in one order fails with 23505. T-ORD-103 (proposed). That the number starts with the parent's number is checked by the action, because a CHECK cannot read the parent row.

**Indexes.**

| Index                                                       | Definition                                                 | Query served                                                                                                                                                            |
| ----------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shop_orders_order_shop_key`                                | `(order_id, shop_id)`                                      | Shop orders of an order: customer order page, parent recompute, locking in `id` order ([05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)) |
| `shop_orders_number_key`                                    | `(number)`                                                 | `getShopOrder`: `WHERE number = :n AND shop_id = :resolved_shop`                                                                                                        |
| `shop_orders_seller_list_idx`                               | `(shop_id, status, created_at DESC, id DESC)`              | Seller order list by tab: `WHERE shop_id = ? AND status = ? ORDER BY created_at DESC, id DESC`                                                                          |
| `shop_orders_seller_all_idx`                                | `(shop_id, created_at DESC, id DESC)`                      | Seller order list, "All" tab; admin view of one shop's orders                                                                                                           |
| `shop_orders_acceptance_due_idx`                            | `(acceptance_due_at) WHERE status = 'awaiting_acceptance'` | Acceptance-timeout sweeper: `WHERE status = 'awaiting_acceptance' AND acceptance_due_at <= now()`                                                                       |
| `shop_orders_accepted_idx`                                  | `(id) WHERE status = 'accepted'`                           | Auto-complete sweep: accepted shop orders joined to delivered shipments past the return window. The partial index holds only open orders                                |
| `shop_orders_id_shop_id_key`, `shop_orders_id_order_id_key` |                                                            | Foreign-key targets only                                                                                                                                                |

**Lifecycle and retention.** Inserted by checkout. Status and its timestamps change by compare-and-set; amounts never change. Retained as §11.1.

### 11.3 order_items

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

CREATE FUNCTION order_items_counters_only_grow() RETURNS trigger LANGUAGE plpgsql AS $$
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

The commission formula is not a CHECK. Its base depends on who funds an R2 discount ([05 §3.4](05-order-payment-and-inventory-lifecycles.md#34-discount-allocation)), which the row does not record. The pricing function computes it, and T-ORD-008 checks the cumulative allocation and the rounding. A crafted line that points at another shop's variant fails with 23503 (T-ORD-104, [04 §2.5](04-domain-model-and-data-dictionary.md)).

**Indexes.**

| Index                                                                                               | Definition                    | Query served                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `order_items_shop_order_variant_key`                                                                | `(shop_order_id, variant_id)` | Lines of a shop order: seller and customer order detail, fulfilment, refund and return forms                                                                                           |
| `order_items_variant_idx`                                                                           | `(variant_id)`                | `replaceProductVariants` deciding between hard delete and archive: `EXISTS (SELECT 1 FROM order_items WHERE variant_id = :v)`; also the RESTRICT check when a draft variant is deleted |
| `order_items_id_shop_id_key`, `order_items_id_shop_order_id_key`, `order_items_reservation_ref_key` |                               | Foreign-key targets only                                                                                                                                                               |

**Lifecycle and retention.** Inserted by checkout. Only the three removal counters change, and only upwards. Retained as §11.1.

### 11.4 order_events

**Module** `orders` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal, Internal

The timeline of an order: what happened, who did it and who may see it. Admin notes (`addOrderNote`) are internal events. The `audit_logs` row of the same action (§15.3) is the accountability record. This table is the display record.

| Column          | Type        | Null | Default    | Notes                                                                                                                                                                      |
| --------------- | ----------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`            | uuid        | no   | `uuidv7()` |                                                                                                                                                                            |
| `order_id`      | uuid        | no   | App        |                                                                                                                                                                            |
| `shop_order_id` | uuid        | yes  | —          | Null for order-level events                                                                                                                                                |
| `type`          | text        | no   | App        | `<subject>.<event>`: `order.placed`, `shop_order.accepted`, `shop_order.items_rejected`, `shipment.shipped`, `payment.cod_collected`, `order.note`, `order.status_changed` |
| `visibility`    | text        | no   | App        | `customer`, `shop`, `internal`                                                                                                                                             |
| `data`          | jsonb       | no   | `'{}'`     | Small typed object, for example `{"from":"awaiting_acceptance","to":"accepted"}`. Never customer contact data                                                              |
| `actor_type`    | text        | no   | App        | `customer`, `shop_member`, `platform_staff`, `system`, `provider`                                                                                                          |
| `actor_user_id` | uuid        | yes  | —          |                                                                                                                                                                            |
| `created_at`    | timestamptz | no   | `now()`    |                                                                                                                                                                            |

Who sees what: the customer sees `customer` events. A shop member sees `customer` and `shop` events of their own shop orders. Staff see everything. `internal` never leaves the admin surface ([07](07-security-threat-model-and-permissions.md)).

**Keys and constraints.**

```sql
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

**Lifecycle and retention.** Insert-only. Retained as §11.1.

### 11.5 shipments

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Entity · **Sensitivity** Internal (tracking data is shown to the customer)

The parcel of a shop order. R1 has exactly one shipment per shop order and no courier API: every transition is a vendor entry through `recordFulfillmentEvent` [Confirmed Q5]. The machine is [05 §6.3](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment).

| Column                       | Type        | Null | Default     | Notes                                                                                             |
| ---------------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------------------------------- |
| `id`                         | uuid        | no   | `uuidv7()`  |                                                                                                   |
| `shop_order_id`              | uuid        | no   | App         | Unique in R1                                                                                      |
| `shop_id`                    | uuid        | no   | App         |                                                                                                   |
| `status`                     | text        | no   | `'pending'` | `pending`, `packed`, `shipped`, `delivered`, `delivery_failed`, `returning`, `returned_to_origin` |
| `courier_name`               | text        | yes  | —           | Free text in R1 (for example "Nepal Can Move", own rider). R3 courier APIs add a `courier_code`   |
| `tracking_number`            | text        | yes  | —           |                                                                                                   |
| `tracking_url`               | text        | yes  | —           | HTTPS only, so a vendor cannot plant a `javascript:` link on the customer's order page            |
| `shipped_at`, `delivered_at` | timestamptz | yes  | —           | `delivered_at` starts the return window and the ledger hold                                       |
| `attempt_count`              | smallint    | no   | `0`         | 1 at first shipment, +1 per reattempt                                                             |
| `version`                    | int         | no   | `1`         |                                                                                                   |
| `created_at`, `updated_at`   | timestamptz | no   | `now()`     |                                                                                                   |

**Keys and constraints.**

```sql
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
CONSTRAINT shipments_attempt_count_check CHECK (attempt_count BETWEEN 0 AND 3),  -- reattempt limit [Assumption, 05 §6.3]
CONSTRAINT shipments_courier_name_check
  CHECK (courier_name IS NULL OR char_length(courier_name) BETWEEN 2 AND 80),
CONSTRAINT shipments_tracking_number_check
  CHECK (tracking_number IS NULL OR char_length(tracking_number) BETWEEN 3 AND 64),
CONSTRAINT shipments_tracking_url_check
  CHECK (tracking_url IS NULL OR (tracking_url ~ '^https://' AND char_length(tracking_url) <= 500))
```

T-FUL-101 (proposed) sets each shipped status without the required fields and expects 23514.

**Indexes.**

| Index                        | Definition                                                    | Query served                                                                                                                                |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `shipments_shop_order_key`   | `(shop_order_id)`                                             | Shipment of a shop order (every fulfilment action, order pages)                                                                             |
| `shipments_to_ship_idx`      | `(shop_id, created_at) WHERE status IN ('pending', 'packed')` | Seller "ready to ship" list: `WHERE shop_id = ? AND status IN ('pending','packed') ORDER BY created_at`                                     |
| `shipments_delivered_at_idx` | `(delivered_at) WHERE status = 'delivered'`                   | COD outcome reminders (24 h and 72 h after delivery) and auto-complete: `WHERE status = 'delivered' AND delivered_at BETWEEN :from AND :to` |

**Lifecycle and retention.** Created in the accept transaction. Updated by fulfilment events. Never deleted. Retained as §11.1. R2 partial shipments (FR-FUL-005) drop `shipments_shop_order_key` and add a `shipment_items` table.

### 11.6 shipment_events

**Module** `orders` · **Release** R1 · **Shop scope** `shop_id`, composite FK · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Internal

One row per fulfilment event recorded by the vendor (or by staff for a frozen shop).

| Column                   | Type        | Null | Default    | Notes                                                                                                                                     |
| ------------------------ | ----------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                     | uuid        | no   | `uuidv7()` |                                                                                                                                           |
| `shipment_id`, `shop_id` | uuid        | no   | App        |                                                                                                                                           |
| `event`                  | text        | no   | App        | `packed`, `shipped`, `delivered`, `delivery_failed`, `reattempt`, `returning`, `returned_to_origin` (the `recordFulfillmentEvent` values) |
| `status`                 | text        | no   | App        | Shipment status after the event                                                                                                           |
| `reason_code`            | text        | yes  | —          | Only for `delivery_failed`: `customer_unreachable`, `refused`, `address_problem`, `other`                                                 |
| `note`                   | text        | yes  | —          | At most 500 characters                                                                                                                    |
| `actor_type`             | text        | no   | App        | `shop_member`, `platform_staff`, `system`                                                                                                 |
| `actor_user_id`          | uuid        | yes  | —          |                                                                                                                                           |
| `created_at`             | timestamptz | no   | `now()`    |                                                                                                                                           |

**Keys and constraints.**

```sql
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

**Indexes.** `shipment_events_shipment_idx (shipment_id, created_at, id)` serves the tracking timeline. If OD-18 adopts the repeat-refuser COD rule (`cod_max_refusals`, §15.1), `shipment_events_refused_idx (created_at) WHERE reason_code = 'refused'` is added with it to count a customer's refusals in the window. It is not created before that decision.

**Lifecycle and retention.** Insert-only. Retained as §11.1.

### 11.7 return_requests

**Module** `orders` · **Release** R1 (created by support staff, FR-RET-006); R2 self-serve · **Shop scope** `shop_id` · **Lifecycle** Entity · **Sensitivity** Personal

A return of delivered units, created by support on the customer's behalf in R1 because the Consumer Protection Act 2075 s14 and E-Commerce Act s10 make returns an R1 obligation [Verify-external VX-04, VX-02] (canon §17.4). Machine: [05 §6.6](05-order-payment-and-inventory-lifecycles.md#66-returnrequest-r1-support-created-r2-self-serve).

| Column                                 | Type        | Null | Default       | Notes                                                                                                                                                                                                        |
| -------------------------------------- | ----------- | ---- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                                   | uuid        | no   | `uuidv7()`    |                                                                                                                                                                                                              |
| `number`                               | text        | no   | App           | `RT-` + 7 Crockford base32                                                                                                                                                                                   |
| `order_id`, `shop_order_id`, `shop_id` | uuid        | no   | App           |                                                                                                                                                                                                              |
| `requested_by_user_id`                 | uuid        | no   | App           | The customer. The composite FK below proves it is the order's customer                                                                                                                                       |
| `created_by_staff_id`                  | uuid        | yes  | —             | The support agent. Always set in R1; null for R2 self-serve                                                                                                                                                  |
| `support_case_id`                      | uuid        | yes  | —             | The case the return came from, if any                                                                                                                                                                        |
| `reason_code`                          | text        | no   | App           | `not_as_described`, `damaged`, `wrong_item`, `size_issue`, `changed_mind`, `other`                                                                                                                           |
| `status`                               | text        | no   | `'requested'` | `requested`, `approved`, `rejected`, `in_transit`, `received`, `closed`, `rejected_after_inspection`                                                                                                         |
| `customer_note`                        | text        | yes  | —             | At most 1,000 characters                                                                                                                                                                                     |
| `resolution_note`                      | text        | yes  | —             | Required when rejected; the customer sees it                                                                                                                                                                 |
| `approved_at`                          | timestamptz | yes  | —             |                                                                                                                                                                                                              |
| `refund_due_at`                        | timestamptz | yes  | —             | Set at approval: `approved_at + 7 days`, the conservative start of the Directive 2082 s9(3) refund clock ([05 §11](05-order-payment-and-inventory-lifecycles.md#11-legal-overlays); [Verify-external VX-02]) |
| `received_at`, `closed_at`             | timestamptz | yes  | —             |                                                                                                                                                                                                              |
| `version`                              | int         | no   | `1`           |                                                                                                                                                                                                              |
| `created_at`, `updated_at`             | timestamptz | no   | `now()`       |                                                                                                                                                                                                              |

**Keys and constraints.**

```sql
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
CONSTRAINT return_requests_case_fkey FOREIGN KEY (support_case_id)
  REFERENCES support_cases (id) ON DELETE RESTRICT,
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

`return_requests_customer_fkey` means a support agent cannot attach a return for customer X to customer Y's order, even through a bug. T-RET-101 (proposed). The window and quantity rules (`quantity ≤ kept − returned − units in open returns`, within `return_window_days` of `delivered_at`) span rows and are checked in the create transaction with the shop order row locked ([05 §6.6](05-order-payment-and-inventory-lifecycles.md#66-returnrequest-r1-support-created-r2-self-serve)).

**Indexes.**

| Index                                 | Definition                                                                              | Query served                                                                                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `return_requests_number_key`          | `(number)`                                                                              | Lookup by `{returnNumber}` (seller with `shop_id = :resolved_shop`, admin)                                                                                    |
| `return_requests_open_shop_order_idx` | `(shop_order_id) WHERE status IN ('requested','approved','in_transit','received')`      | "Open return on this shop order" in auto-complete and payout eligibility ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)) |
| `return_requests_seller_list_idx`     | `(shop_id, created_at DESC, id DESC)`                                                   | `listShopReturns`                                                                                                                                             |
| `return_requests_admin_queue_idx`     | `(status, created_at) WHERE status IN ('requested','approved','in_transit','received')` | Admin returns queue by status                                                                                                                                 |
| `return_requests_refund_due_idx`      | `(refund_due_at) WHERE status IN ('approved','in_transit','received')`                  | Refund SLA monitor before the refund exists: `WHERE refund_due_at < now() + interval '2 days'`                                                                |

**Lifecycle and retention.** Status changes by compare-and-set. Never deleted. The Directive s14 lists consumer complaints among the records to keep at least five years; returns are kept with the order record, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 11.8 return_items

**Module** `orders` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record · **Sensitivity** Internal

The lines and units of a return, with the shop's condition notes and support's restock decision.

| Column                     | Type        | Null | Default | Notes                                                                                                                                   |
| -------------------------- | ----------- | ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `return_request_id`        | uuid        | no   | App     |                                                                                                                                         |
| `order_item_id`            | uuid        | no   | App     |                                                                                                                                         |
| `shop_order_id`            | uuid        | no   | App     | Carried for the two composite FKs                                                                                                       |
| `quantity`                 | int         | no   | App     |                                                                                                                                         |
| `condition_note`           | text        | yes  | —       | Written at receipt                                                                                                                      |
| `restock`                  | boolean     | yes  | —       | Decided at close: `true` writes a `return_restock` movement ([05 §5.7](05-order-payment-and-inventory-lifecycles.md#57-return-restock)) |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                                                                                                                         |

**Keys and constraints.**

```sql
CONSTRAINT return_items_pkey PRIMARY KEY (return_request_id, order_item_id),
CONSTRAINT return_items_request_fkey FOREIGN KEY (return_request_id, shop_order_id)
  REFERENCES return_requests (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT return_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
  REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT return_items_quantity_check CHECK (quantity > 0),
CONSTRAINT return_items_condition_note_check
  CHECK (condition_note IS NULL OR char_length(condition_note) <= 1000)
```

The two composite FKs share `shop_order_id`, so a return can only list lines of its own shop order. Written with the query builder inside the owning action (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** `return_items_order_item_idx (order_item_id)` serves "units of this line already in returns": `SUM(quantity) … WHERE order_item_id = :i` joined to open or closed returns.

**Lifecycle and retention.** Inserted with the return. `condition_note` and `restock` are written once each. Retained as §11.7.

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

### 12.1 payments

**Module** `payments` · **Release** R1 (COD); gateway columns from R1.1 · **Shop scope** none (order-level; COD rows point at one shop order) · **Lifecycle** Record · **Sensitivity** Financial

One gateway attempt for a whole order, or one COD collection per shop order ([05 §2.3](05-order-payment-and-inventory-lifecycles.md#23-what-it-costs)).

| Column                                      | Type        | Null | Default    | Notes                                                                                                                                                                |
| ------------------------------------------- | ----------- | ---- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                        | uuid        | no   | `uuidv7()` | Also the provider attempt key                                                                                                                                        |
| `order_id`                                  | uuid        | no   | App        |                                                                                                                                                                      |
| `shop_order_id`                             | uuid        | yes  | —          | Set for COD (one payment per shop order), null for gateway                                                                                                           |
| `method`                                    | text        | no   | App        | `cod`, `esewa`, `khalti`                                                                                                                                             |
| `status`                                    | text        | no   | App        | COD: `awaiting_collection`, `collected`, `not_collected`, `cancelled`. Gateway: `initiated`, `pending`, `captured`, `failed`, `expired`, `cancelled`, `needs_review` |
| `amount_minor`                              | bigint      | no   | App        | To collect or capture. A COD amount only decreases, and only while `awaiting_collection` (item-level rejection)                                                      |
| `currency`                                  | char(3)     | no   | `'NPR'`    |                                                                                                                                                                      |
| `captured_minor`                            | bigint      | no   | `0`        | Equals `amount_minor` once `captured` or `collected`                                                                                                                 |
| `refunded_minor`                            | bigint      | no   | `0`        | Increased when a refund succeeds                                                                                                                                     |
| `captured_at`                               | timestamptz | yes  | —          | Capture or cash collection time                                                                                                                                      |
| `provider_payment_id`, `provider_reference` | text        | yes  | —          | Table above                                                                                                                                                          |
| `attempt_no`                                | smallint    | no   | `1`        | Gateway retries create a new row with `attempt_no + 1`                                                                                                               |
| `expires_at`                                | timestamptz | yes  | —          | Gateway session expiry                                                                                                                                               |
| `verification_attempts`                     | int         | no   | `0`        | Lookups made                                                                                                                                                         |
| `next_verification_at`                      | timestamptz | yes  | —          | Schedule and lease for `payments.verify` ([05 §9.4](05-order-payment-and-inventory-lifecycles.md#94-reconciliation-schedule))                                        |
| `last_provider_status`                      | text        | yes  | —          | Raw status string from the last lookup, for the review queue                                                                                                         |
| `version`                                   | int         | no   | `1`        |                                                                                                                                                                      |
| `created_at`, `updated_at`                  | timestamptz | no   | `now()`    |                                                                                                                                                                      |

**Keys and constraints.**

```sql
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
  WHERE method <> 'cod' AND status IN ('initiated', 'pending', 'captured');
CREATE UNIQUE INDEX payments_gateway_attempt_no_key ON payments (order_id, attempt_no) WHERE method <> 'cod';
CREATE UNIQUE INDEX payments_cod_shop_order_key ON payments (shop_order_id) WHERE method = 'cod';

-- A payment amount never grows; a COD amount shrinks only before collection (Directive 2082 s8(3))
CREATE FUNCTION payments_amount_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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

- `payments_one_live_gateway_attempt_key` is the canonical "one live gateway attempt per order" rule. Two concurrent `startOrderPayment` retries both try to insert a new `initiated` row; the second gets 23505 and the API answers 409 `CONFLICT` ([05 §4.8](05-order-payment-and-inventory-lifecycles.md#48-gateway-initiation-after-commit-r11)). T-PAY-101 (proposed).
- `payments_refunded_le_captured_check` is the database backstop for "refunds never exceed what was captured". The refund action checks the refundable amount first and returns 422 `REFUND_EXCEEDS_REFUNDABLE`; the CHECK stops a bug that skips that check (T-SEC-004).
- `payments_cod_shop_order_key` guarantees one cash collection per parcel, and `payments_amount_guard` means the amount a courier may collect can go down (rejected items) but never up. Directive 2082 s8(3) bars collecting more than the pre-agreed price and transport at handover [Verify-external VX-02]. T-PAY-102 (proposed).
- That `payments.method` equals `orders.payment_method` spans two tables and is set by the checkout action only.

**Indexes.**

| Index                            | Definition                                                                           | Query served                                                                                                                                                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `payments_order_idx`             | `(order_id)`                                                                         | Payments of an order: order pages, refund creation, capture                                                                                                                                                                                     |
| `payments_verify_due_idx`        | `(next_verification_at) WHERE method <> 'cod' AND status IN ('initiated','pending')` | Verify sweeper and the expiry job's lease: `WHERE method <> 'cod' AND status IN ('initiated','pending') AND next_verification_at <= now() … FOR UPDATE SKIP LOCKED` ([05 §5.4](05-order-payment-and-inventory-lifecycles.md#54-expiration-job)) |
| `payments_needs_review_idx`      | `(created_at) WHERE status = 'needs_review'`                                         | Admin review queue sorted by age ([05 §9.5](05-order-payment-and-inventory-lifecycles.md#95-manual-review-queue-needs_review))                                                                                                                  |
| `payments_provider_payment_key`  | `(method, provider_payment_id)`                                                      | Return handler and webhook: find our attempt by `pidx`                                                                                                                                                                                          |
| the three partial unique indexes | above                                                                                | COD payment of a shop order; live attempt of an order                                                                                                                                                                                           |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. Financial record: at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 12.2 payment_allocations

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

The two FKs share `order_id`, so a payment can only be allocated to shop orders of the order it pays ([04 §2.5](04-domain-model-and-data-dictionary.md)). Σ allocations = `payments.amount_minor` spans rows: the checkout and rejection actions write both in one transaction and the nightly integrity job re-checks it. Written with the query builder (composite primary key, [04 §2.15](04-domain-model-and-data-dictionary.md)).

**Indexes.** `payment_allocations_shop_order_idx (shop_order_id)` serves the refundable amount of a shop order and the payout "held" check.

**Lifecycle and retention.** As §12.1.

### 12.3 provider_events

**Module** `payments` · **Release** R1.1 (created in R0, [04 §1.2](04-domain-model-and-data-dictionary.md)) · **Shop scope** none · **Lifecycle** Record · **Sensitivity** Financial; payer data redacted

Every message exchanged with a provider about a payment or refund: redirects to our return URL, webhooks, lookups, initiations and refund calls. It deduplicates inbound messages and is the evidence trail for the review queue. No state changes on a message alone: a verification lookup always decides (ADR-0012).

| Column               | Type        | Null | Default     | Notes                                                                                                         |
| -------------------- | ----------- | ---- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| `id`                 | uuid        | no   | `uuidv7()`  |                                                                                                               |
| `provider`           | text        | no   | App         | `esewa`, `khalti`                                                                                             |
| `provider_event_key` | text        | no   | App         | Deterministic key, below                                                                                      |
| `kind`               | text        | no   | App         | `initiate`, `return`, `webhook`, `lookup`, `refund`, `refund_lookup`                                          |
| `payment_id`         | uuid        | yes  | —           | Null when a forged or unknown return cannot be matched                                                        |
| `refund_id`          | uuid        | yes  | —           |                                                                                                               |
| `payload`            | jsonb       | no   | App         | Redacted: the payer mobile number that Khalti returns becomes its last four digits; no names                  |
| `raw_body_sha256`    | bytea       | yes  | —           | SHA-256 of the raw body as received, proving what arrived without keeping it                                  |
| `signature_valid`    | boolean     | yes  | —           | Null when the message is unsigned (Khalti's return URL carries no signature [Verified-doc Khalti docs above]) |
| `received_at`        | timestamptz | no   | `now()`     |                                                                                                               |
| `processed_at`       | timestamptz | yes  | —           |                                                                                                               |
| `processing_status`  | text        | no   | `'pending'` | `pending`, `processed`, `ignored`, `failed`                                                                   |
| `error`              | text        | yes  | —           | At most 2,000 characters, redacted                                                                            |
| `request_id`         | text        | yes  | —           |                                                                                                               |

**Event keys.** Return: `return:<attempt key>:<provider status>`. Webhook: the provider's event id, else `webhook:<hex sha256 of body>`. Initiate: `initiate:<payment id>`. Lookup: `lookup:<payment id>:<provider status>`. Refund call: `refund:<refund id>:<attempt>`; refund lookup `refund_lookup:<refund id>:<provider status>`. Keying lookups by status collapses the thirty "still Initiated" answers of the first half hour into one row, so the table grows by about three rows per payment instead of forty; `payments.verification_attempts` keeps the count.

**Keys and constraints.**

```sql
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

**Lifecycle and retention.** `payload` never changes; only the processing columns do. Retained with the payment, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md)), because it is the evidence in a payment dispute.

### 12.4 refunds

**Module** `payments` · **Release** R1 (`manual_transfer`); `gateway_api` and `gateway_manual` from R1.1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial; `recipient_details_enc` Sensitive-personal

Money returned to a customer for one shop order, from one payment allocation. Methods per canon §17.1: `gateway_api` (Khalti refund API), `gateway_manual` (eSewa, which documents no refund API: an operator refunds in the merchant portal and records the reference), `manual_transfer` (COD and any fallback). Machine: [05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund).

| Column                                               | Type        | Null | Default       | Notes                                                                                                                                                             |
| ---------------------------------------------------- | ----------- | ---- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                 | uuid        | no   | `uuidv7()`    |                                                                                                                                                                   |
| `order_id`, `shop_order_id`, `shop_id`, `payment_id` | uuid        | no   | App           | `shop_id` is copied from the locked shop order                                                                                                                    |
| `return_request_id`                                  | uuid        | yes  | —             | Set when the refund closes a return                                                                                                                               |
| `amount_minor`                                       | bigint      | no   | App           | Σ `refund_items.amount_minor` + shipping part ([05 §6.7](05-order-payment-and-inventory-lifecycles.md#67-refund))                                                 |
| `currency`                                           | char(3)     | no   | `'NPR'`       |                                                                                                                                                                   |
| `method`                                             | text        | no   | App           | `gateway_api`, `gateway_manual`, `manual_transfer`                                                                                                                |
| `status`                                             | text        | no   | `'requested'` | `requested`, `approved`, `processing`, `succeeded`, `failed`, `cancelled`, `needs_review`                                                                         |
| `reason_code`                                        | text        | no   | App           | `order_cancelled`, `items_rejected`, `undeliverable`, `return_accepted`, `late_capture`, `stock_unavailable_after_payment`, `goodwill`, `other`                   |
| `note`                                               | text        | yes  | —             | At most 2,000 characters                                                                                                                                          |
| `due_at`                                             | timestamptz | no   | App           | 7-day deadline (Directive 2082 s9(3) [Verify-external VX-02]): the return's `refund_due_at` for return refunds, otherwise `created_at + 7 days` (AC-FR-RET-007-1) |
| `provider_refund_id`                                 | text        | yes  | —             | Provider's refund reference, where one is returned                                                                                                                |
| `provider_idempotency_key`                           | text        | no   | App           | `refunds.id` as text; sent wherever the provider accepts it ([05 §9.3](05-order-payment-and-inventory-lifecycles.md#93-provider-idempotency-keys))                |
| `attempts`                                           | int         | no   | `0`           | Provider calls or transfer attempts                                                                                                                               |
| `created_by`                                         | uuid        | yes  | —             | Null for system refunds (rejection, cancellation, late capture)                                                                                                   |
| `approved_by`                                        | uuid        | yes  | —             | Null for auto-approved system refunds                                                                                                                             |
| `is_single_operator_approval`                        | boolean     | no   | `false`       | True when `single_operator_mode` allowed self-approval with TOTP re-entry (OD-14); the audit row is flagged too                                                   |
| `recipient_details_enc`                              | text        | yes  | —             | `manual_transfer` only: encrypted JSON `{account_name, bank_or_wallet, account_number}` ([04 §2.9](04-domain-model-and-data-dictionary.md))                       |
| `paid_reference`                                     | text        | yes  | —             | Bank or wallet transfer reference; for `gateway_manual` the provider's reference                                                                                  |
| `approved_at`, `succeeded_at`                        | timestamptz | yes  | —             |                                                                                                                                                                   |
| `version`                                            | int         | no   | `1`           |                                                                                                                                                                   |
| `created_at`, `updated_at`                           | timestamptz | no   | `now()`       |                                                                                                                                                                   |

**Keys and constraints.**

```sql
CONSTRAINT refunds_provider_idempotency_key_key UNIQUE (provider_idempotency_key),
CONSTRAINT refunds_id_shop_id_key UNIQUE (id, shop_id),                 -- target for §13.1
CONSTRAINT refunds_id_shop_order_id_key UNIQUE (id, shop_order_id),     -- target for §12.5
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
CONSTRAINT refunds_approved_check
  CHECK (status IN ('requested', 'cancelled') OR approved_at IS NOT NULL),
CONSTRAINT refunds_succeeded_check CHECK ((status = 'succeeded') = (succeeded_at IS NOT NULL)
  AND (status <> 'succeeded' OR method = 'gateway_api' OR paid_reference IS NOT NULL)),
CONSTRAINT refunds_recipient_check CHECK (method <> 'manual_transfer'
  OR status IN ('requested', 'cancelled') OR recipient_details_enc IS NOT NULL),
CONSTRAINT refunds_attempts_check CHECK (attempts >= 0)
```

- `refunds_allocation_fkey` targets the allocation's primary key: a refund can only be drawn from the payment that actually paid this shop order.
- `refunds_maker_checker_check` is the canonical maker-checker rule (canon §7, OD-14). The approver differs from the creator unless the approval was flagged as single-operator. T-ADM-101 (proposed) approves one's own refund with the flag false and expects 23514.
- Refundable amount per shop order (`captured − Σ refunds not cancelled`) spans rows. `createRefund` computes it with the payment and allocation rows locked `FOR UPDATE` (lock level 6, [05 §4.4](05-order-payment-and-inventory-lifecycles.md#44-global-lock-ordering)) and answers 422 `REFUND_EXCEEDS_REFUNDABLE`. On success, `refunded_minor` rises on both the payment and the allocation, where the CHECKs of §12.1 and §12.2 are the backstop (T-SEC-004).

**Indexes.**

| Index                         | Definition                                                                               | Query served                                                                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `refunds_shop_order_idx`      | `(shop_order_id)`                                                                        | Refundable amount; payout "held" check; order pages                                                                                        |
| `refunds_queue_idx`           | `(due_at) WHERE status IN ('requested','approved','processing','failed','needs_review')` | Admin refunds queue sorted by due date (AC-FR-RET-007-2) and the SLA monitor: `WHERE status IN (…) AND due_at < now() + interval '2 days'` |
| `refunds_return_idx`          | `(return_request_id) WHERE return_request_id IS NOT NULL`                                | Refund of a return (return close, SLA reporting)                                                                                           |
| `refunds_provider_refund_key` | UNIQUE `(method, provider_refund_id) WHERE provider_refund_id IS NOT NULL`               | Matching a provider refund status to our row; one provider refund cannot be recorded twice                                                 |

**Lifecycle and retention.** Status by compare-and-set. Never deleted; a mistaken refund is `cancelled` before it is paid. Financial record, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md)). `recipient_details_enc` is needed only until the transfer succeeds; [04 §19.2](04-domain-model-and-data-dictionary.md) and [04 §19.3](04-domain-model-and-data-dictionary.md) decide when it is overwritten.

### 12.5 refund_items

**Module** `payments` · **Release** R1 · **Shop scope** through `shop_order_id` · **Lifecycle** Record · **Sensitivity** Financial

The units and amounts a refund covers per order line. The amount per line is the cumulative `A(k + r) − A(k)` of [05 §3.2](05-order-payment-and-inventory-lifecycles.md#32-amounts-as-placed-versus-effective).

| Column                       | Type        | Null | Default | Notes                             |
| ---------------------------- | ----------- | ---- | ------- | --------------------------------- |
| `refund_id`, `order_item_id` | uuid        | no   | App     | Composite primary key             |
| `shop_order_id`              | uuid        | no   | App     | Carried for the two composite FKs |
| `quantity`                   | int         | no   | App     |                                   |
| `amount_minor`               | bigint      | no   | App     |                                   |
| `currency`                   | char(3)     | no   | `'NPR'` |                                   |
| `created_at`                 | timestamptz | no   | `now()` |                                   |

**Keys and constraints.**

```sql
CONSTRAINT refund_items_pkey PRIMARY KEY (refund_id, order_item_id),
CONSTRAINT refund_items_refund_fkey FOREIGN KEY (refund_id, shop_order_id)
  REFERENCES refunds (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refund_items_order_item_fkey FOREIGN KEY (order_item_id, shop_order_id)
  REFERENCES order_items (id, shop_order_id) ON DELETE RESTRICT,
CONSTRAINT refund_items_quantity_check CHECK (quantity > 0),
CONSTRAINT refund_items_amount_check CHECK (amount_minor >= 0),
CONSTRAINT refund_items_currency_check CHECK (currency = 'NPR')
```

The shipping part of a refund (`refunds.amount_minor − Σ refund_items.amount_minor`) must be between 0 and the shop order's `shipping_fee_minor`; the create action checks it because it spans tables.

**Indexes.** `refund_items_order_item_idx (order_item_id)` serves "units of this line already refunded", which gives `k` in the cumulative rule.

**Lifecycle and retention.** Inserted with the refund, never updated. Retained as §12.4.

---

## 13. Ledger and payouts

The `ledger` module owns the per-shop sub-ledger of what DripNepal and each vendor owe each other (ADR-0009). It is not the platform's general ledger. Posting rules, availability and netting are owned by [05 §7](05-order-payment-and-inventory-lifecycles.md#7-vendor-ledger-and-settlement); the worked example there (§7.11) is golden test T-LED-001. In R1 (COD only) vendors hold the customer's cash, so balances are normally negative until the vendor remits commission [Confirmed Q3–Q5]. The schema therefore allows negative balances by design.

### 13.1 ledger_entries

**Module** `ledger` · **Release** R1 · **Shop scope** `shop_id`, composite FKs to every referenced row · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Financial

| Column                                                                      | Type        | Null | Default    | Notes                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ----------- | ---- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                                                        | uuid        | no   | `uuidv7()` |                                                                                                                                                                              |
| `shop_id`                                                                   | uuid        | no   | App        | From the locked shop order, payout or remittance row, never from input                                                                                                       |
| `entry_type`                                                                | text        | no   | App        | `sale`, `shipping_income`, `commission`, `commission_reversal`, `cod_cash_held`, `refund`, `vendor_remittance`, `payout`, `payout_reversal`, `tax_withholding`, `adjustment` |
| `amount_minor`                                                              | bigint      | no   | App        | Signed: positive means the platform owes the vendor                                                                                                                          |
| `currency`                                                                  | char(3)     | no   | `'NPR'`    |                                                                                                                                                                              |
| `shop_order_id`, `order_item_id`, `refund_id`, `payout_id`, `remittance_id` | uuid        | yes  | —          | What the entry is about; which one is required depends on the type                                                                                                           |
| `reverses_entry_id`                                                         | uuid        | yes  | —          | The entry this one reverses                                                                                                                                                  |
| `available_at`                                                              | timestamptz | no   | App        | When the entry may be paid out ([05 §7.2](05-order-payment-and-inventory-lifecycles.md#72-entry-types-and-posting-rules) group rule)                                         |
| `description`                                                               | text        | no   | App        | Statement text; for `adjustment`, the reason (at least 20 characters, AC-FR-LED-005-1)                                                                                       |
| `created_by`                                                                | uuid        | yes  | —          | Staff member for adjustments and remittances; null for system postings                                                                                                       |
| `dedupe_key`                                                                | text        | no   | App        | Deterministic key, for example `delivery:<shop_order_id>:sale`                                                                                                               |
| `created_at`                                                                | timestamptz | no   | `now()`    |                                                                                                                                                                              |

**Keys and constraints.**

```sql
CONSTRAINT ledger_entries_dedupe_key_key UNIQUE (dedupe_key),
CONSTRAINT ledger_entries_id_shop_id_key UNIQUE (id, shop_id),          -- target for §13.3 and self-reference
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

- **Exactly once.** Posting functions insert with `ON CONFLICT (dedupe_key) DO NOTHING`, so a repeated delivery event, job or request cannot post twice (T-LED-005, T-PAY-005).
- **Append-only.** Privileges and the trigger of [04 §2.12](04-domain-model-and-data-dictionary.md) stop `UPDATE` and `DELETE` for every role, including the owner; a correction is a new `adjustment` or reversal entry (FR-LED-005). T-LED-002.
- **No cross-shop entries.** Every reference is a composite FK with `shop_id`, so an entry for shop A cannot point at shop B's shop order, refund, payout or remittance, and a reversal cannot reverse another shop's entry (T-SEC-001 at the API, 23503 at the database).
- **Sign and reference per type.** The two CASE CHECKs turn the posting table of [05 §7.2](05-order-payment-and-inventory-lifecycles.md#72-entry-types-and-posting-rules) into constraints. A `commission` posted as a positive number fails with 23514 instead of paying the vendor the platform's commission. T-LED-101 (proposed).
- **`tax_withholding`** is in the value list from the baseline so that OD-27 can enable it without a migration ([05 §7.9](05-order-payment-and-inventory-lifecycles.md#79-tax_withholding-reserved-pending-od-27)).

**Indexes.**

| Index                               | Definition                                                                             | Query served                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ledger_entries_dedupe_key_key`     | `(dedupe_key)`                                                                         | Exactly-once insert; "does a delivery posting exist": `WHERE dedupe_key = 'delivery:' \|\| :so \|\| ':sale'`                                                                                                                                                            |
| `ledger_entries_shop_statement_idx` | `(shop_id, created_at DESC, id DESC) INCLUDE (amount_minor, available_at, entry_type)` | `listShopLedgerEntries` and statements by date range; `getShopBalance` sums (`SUM(amount_minor)`, `FILTER (WHERE available_at <= now())`) as an index-only scan ([05 §7.10](05-order-payment-and-inventory-lifecycles.md#710-balances-availability-and-payable-amount)) |
| `ledger_entries_shop_available_idx` | `(shop_id, available_at)`                                                              | Payout eligibility: `WHERE shop_id = :s AND entry_type <> 'payout' AND available_at <= now() AND NOT EXISTS (payout_entries …)` ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11))                                                    |
| `ledger_entries_shop_order_idx`     | `(shop_order_id) WHERE shop_order_id IS NOT NULL`                                      | Integrity check "one delivery group per delivered shop order"; entries of an order on the admin page                                                                                                                                                                    |

**Lifecycle and retention.** Insert-only. A shop's balance is the sum of all its entries, so deleting old entries would change the balance. Entries are therefore kept for the life of the shop and purged, if at all, only for a closed shop with a zero balance, at least 6 years after the end of the fiscal year of its last entry ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 13.2 payouts

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
CONSTRAINT payouts_id_shop_id_key UNIQUE (id, shop_id),                   -- target for §13.1, §13.3
CONSTRAINT payouts_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT payouts_account_fkey FOREIGN KEY (payout_account_id, shop_id)
  REFERENCES shop_payout_accounts (id, shop_id) ON DELETE RESTRICT,       -- needs UNIQUE (id, shop_id) in §6.7
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

`payouts_amount_check` means no payout is created when the eligible sum is zero or negative; the vendor then still owes the platform ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)). `Σ payout_entries = amount_minor = −(its payout entry)` spans tables and is checked nightly ([05 §7.12](05-order-payment-and-inventory-lifecycles.md#712-statements-and-integrity-checks)). T-ADM-101 covers the maker-checker CHECK here too.

**Indexes.**

| Index                           | Definition                            | Query served                                                        |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------- |
| `payouts_shop_idx`              | `(shop_id, created_at DESC, id DESC)` | `listShopPayouts`                                                   |
| `payouts_admin_status_idx`      | `(status, created_at DESC, id DESC)`  | `listPayouts` filtered by status                                    |
| `payouts_one_open_per_shop_key` | above                                 | "Is a payout already in flight for this shop" before `createPayout` |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. Financial record, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md)).

### 13.3 payout_entries

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
CREATE FUNCTION payout_entries_guard() RETURNS trigger LANGUAGE plpgsql AS $$
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

### 13.4 vendor_remittances

**Module** `ledger` · **Release** R1 · **Shop scope** `shop_id` · **Lifecycle** Record · **Sensitivity** Financial

Money a vendor pays DripNepal, mostly COD commission (FR-LED-004 R1 part, [05 §7.5](05-order-payment-and-inventory-lifecycles.md#75-vendor-remittance-r1)). Each row posts one `vendor_remittance` ledger entry in the same transaction. Terms with vendors are [Open OD-05].

| Column         | Type        | Null | Default    | Notes                                                |
| -------------- | ----------- | ---- | ---------- | ---------------------------------------------------- |
| `id`           | uuid        | no   | `uuidv7()` |                                                      |
| `shop_id`      | uuid        | no   | App        |                                                      |
| `amount_minor` | bigint      | no   | App        | At most what the shop owes at recording time         |
| `currency`     | char(3)     | no   | `'NPR'`    |                                                      |
| `method`       | text        | no   | App        | `bank_transfer`, `wallet`, `cash`, `other`           |
| `reference`    | text        | no   | App        | Bank or wallet reference, or receipt number for cash |
| `received_at`  | timestamptz | no   | App        | When the money arrived, as entered by finance        |
| `recorded_by`  | uuid        | no   | App        | Finance officer                                      |
| `note`         | text        | yes  | —          | At most 500 characters                               |
| `created_at`   | timestamptz | no   | `now()`    |                                                      |

**Keys and constraints.**

```sql
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

`vendor_remittances_reference_key` stops the same bank transfer from being recorded twice by two finance officers. The rule "no more than the amount owed" reads the balance, so `recordVendorRemittance` locks the `shops` row `FOR UPDATE` before summing: a remittance that turned the balance positive would make DripNepal hold vendor money, which could look like stored value [Verify-external VX-01].

**Indexes.** `vendor_remittances_shop_idx (shop_id, received_at DESC)` serves the remittance history on the seller finance page and the admin shop page.

**Lifecycle and retention.** Insert-only in practice; a wrong remittance is corrected by an `adjustment` entry with reason, not by editing the row. Financial record, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md)).

---

## 14. Support and notifications

### 14.1 support_cases

**Module** `platform` (canon §6.2) · **Release** R1 · **Shop scope** `shop_id` when a shop is involved · **Lifecycle** Record · **Sensitivity** Personal

The grievance and support register required by E-Commerce Act 2081 s33: a complaint is registered and acknowledged at once, decided within 15 days and answered in writing, through an online mechanism (FR-ADM-009) [Verified-doc <https://giwmscdnone.gov.np/media/files/E-Commerce%20Act%2C%202081_yr7k9o5.pdf>; obligations Verify-external VX-02]. Cases are also opened automatically by the system, for example after a second failed delivery or a disputed COD collection ([05 §6.3, §6.5](05-order-payment-and-inventory-lifecycles.md#63-shipment-fulfillment)).

| Column                                 | Type        | Null | Default                      | Notes                                                                                                                            |
| -------------------------------------- | ----------- | ---- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `id`                                   | uuid        | no   | `uuidv7()`                   |                                                                                                                                  |
| `number`                               | text        | no   | App                          | `SC-` + 7 Crockford base32, shown to the customer at once (AC-FR-ADM-009-1)                                                      |
| `opened_by_user_id`                    | uuid        | yes  | —                            | Customer, or staff member recording a phone or email complaint; null when the system opened it                                   |
| `customer_user_id`                     | uuid        | yes  | —                            | The customer the case concerns; null only for cases not about a customer (for example a vendor dispute)                          |
| `order_id`, `shop_order_id`, `shop_id` | uuid        | yes  | —                            | What the case is about                                                                                                           |
| `category`                             | text        | no   | App                          | `order_issue`, `return_request`, `refund`, `delivery`, `product_complaint`, `account`, `other`                                   |
| `status`                               | text        | no   | `'open'`                     | `open`, `awaiting_customer`, `awaiting_shop`, `resolved`, `closed`                                                               |
| `subject`                              | text        | no   | App                          | 3–150 characters, for lists                                                                                                      |
| `due_at`                               | timestamptz | no   | `now() + interval '15 days'` | Same transaction timestamp as `created_at`, so it is exactly 15 days (s33)                                                       |
| `resolution_summary`                   | text        | yes  | —                            | Required to resolve; the customer sees it. If unresolved, it gives the reasons and the DoCSCP escalation route (AC-FR-ADM-009-3) |
| `assigned_to_user_id`                  | uuid        | yes  | —                            | Support agent                                                                                                                    |
| `resolved_at`, `closed_at`             | timestamptz | yes  | —                            |                                                                                                                                  |
| `version`                              | int         | no   | `1`                          |                                                                                                                                  |
| `created_at`, `updated_at`             | timestamptz | no   | `now()`                      |                                                                                                                                  |

**Keys and constraints.**

```sql
CONSTRAINT support_cases_number_key UNIQUE (number),
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
- `support_cases_due_check` allows a shorter internal target but never a deadline beyond the statutory 15 days, so the deadline cannot be quietly extended. T-ADM-103 (proposed) checks this and the written-resolution rule.

**Indexes.**

| Index                               | Definition                                                                                                   | Query served                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `support_cases_number_key`          | `(number)`                                                                                                   | `getMySupportCase` (with `customer_user_id = :u`), `adminGetSupportCase`                                                                                                   |
| `support_cases_customer_idx`        | `(customer_user_id, created_at DESC, id DESC) WHERE customer_user_id IS NOT NULL`                            | `listMySupportCases`                                                                                                                                                       |
| `support_cases_shop_idx`            | `(shop_id, created_at DESC, id DESC) WHERE shop_id IS NOT NULL`                                              | `listShopSupportCases`                                                                                                                                                     |
| `support_cases_open_due_idx`        | `(due_at) WHERE status IN ('open','awaiting_customer','awaiting_shop')`                                      | Admin register sorted by due date; SLA job warning at `due_at − 3 days` and alerting when overdue (AC-FR-ADM-009-2)                                                        |
| `support_cases_open_shop_order_idx` | `(shop_order_id) WHERE shop_order_id IS NOT NULL AND status IN ('open','awaiting_customer','awaiting_shop')` | Payout "held" check for an open `order_issue` case ([05 §7.6](05-order-payment-and-inventory-lifecycles.md#76-payouts-and-netting-r11)); case list on the admin order page |

**Lifecycle and retention.** Status by compare-and-set. Never deleted. E-Commerce Directive 2082 s14 requires consumer complaints and their hearing to be kept at least five years [Verified-doc <https://giwmscdnone.gov.np/media/pdf_upload/ecommerce-directives_8errkt4.pdf>]; DripNepal keeps them with the order records, at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]).

### 14.2 support_case_messages

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

**Lifecycle and retention.** Insert-only. Retained with the case (§14.1). Attachments are R2.

### 14.3 notification_deliveries

**Module** `notifications` · **Release** R1 (email); SMS in R2 · **Shop scope** none (`shop_id` identifies a shop recipient) · **Lifecycle** Record (operational) · **Sensitivity** Personal

One row per message per recipient, created by `notifications.dispatch` and sent by `notifications.send-email` ([03 §9](03-system-architecture.md#9-asynchronous-work)). The unique `dedupe_key` makes a replayed event send nothing new. The body is not stored: it is re-rendered from the event and template, so personal data is not kept twice.

| Column                     | Type        | Null | Default    | Notes                                                                                                                                                                          |
| -------------------------- | ----------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                       | uuid        | no   | `uuidv7()` |                                                                                                                                                                                |
| `dedupe_key`               | text        | no   | App        | `<event id>:<template>:<recipient id>`                                                                                                                                         |
| `channel`                  | text        | no   | `'email'`  | `email`; `sms` is added in R2 by swapping the CHECK ([04 §2.4](04-domain-model-and-data-dictionary.md))                                                                        |
| `template`                 | text        | no   | App        | For example `order.placed.customer`, `shop_order.placed.shop`                                                                                                                  |
| `recipient_user_id`        | uuid        | yes  | —          | A user recipient                                                                                                                                                               |
| `shop_id`                  | uuid        | yes  | —          | A shop's contact address as recipient                                                                                                                                          |
| `to_address_hash`          | bytea       | no   | App        | Keyed HMAC-SHA256 of the normalised address (key custody in [07](07-security-threat-model-and-permissions.md)); lets support confirm "sent to this address" without storing it |
| `status`                   | text        | no   | `'queued'` | `queued`, `sent`, `failed`                                                                                                                                                     |
| `attempts`                 | int         | no   | `0`        |                                                                                                                                                                                |
| `provider_message_id`      | text        | yes  | —          | From the email provider (OD-08)                                                                                                                                                |
| `last_error`               | text        | yes  | —          | At most 1,000 characters, with addresses redacted                                                                                                                              |
| `sent_at`                  | timestamptz | yes  | —          |                                                                                                                                                                                |
| `created_at`, `updated_at` | timestamptz | no   | `now()`    |                                                                                                                                                                                |

**Keys and constraints.**

```sql
CONSTRAINT notification_deliveries_dedupe_key_key UNIQUE (dedupe_key),
CONSTRAINT notification_deliveries_recipient_fkey FOREIGN KEY (recipient_user_id)
  REFERENCES users (id) ON DELETE RESTRICT,
CONSTRAINT notification_deliveries_shop_fkey FOREIGN KEY (shop_id) REFERENCES shops (id) ON DELETE RESTRICT,
CONSTRAINT notification_deliveries_channel_check CHECK (channel IN ('email')),
CONSTRAINT notification_deliveries_template_check CHECK (template ~ '^[a-z_]+(\.[a-z_]+){1,3}$'),
CONSTRAINT notification_deliveries_status_check CHECK (status IN ('queued', 'sent', 'failed')),
CONSTRAINT notification_deliveries_sent_check CHECK ((status = 'sent') = (sent_at IS NOT NULL)),
CONSTRAINT notification_deliveries_hash_check CHECK (octet_length(to_address_hash) = 32),
CONSTRAINT notification_deliveries_dedupe_key_check CHECK (char_length(dedupe_key) BETWEEN 10 AND 200)
```

Marketing messages are checked against `users.marketing_email_consent_at` at send time (AC-FR-IAM-013-3; Advertisement (Regulation) Act 2076 s10 [Verified-doc <https://lawcommission.gov.np/content/13398/ad--regulation--act-act--2076/>]). A skipped message is recorded as `failed` with `last_error = 'no_consent'`, so the skip is visible. T-NOT-101 (proposed) replays one event three times and expects one row and one sent email.

**Indexes.**

| Index                                    | Definition                                                                 | Query served                                                                                                    |
| ---------------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `notification_deliveries_dedupe_key_key` | `(dedupe_key)`                                                             | `INSERT … ON CONFLICT (dedupe_key) DO NOTHING` in dispatch                                                      |
| `notification_deliveries_recipient_idx`  | `(recipient_user_id, created_at DESC) WHERE recipient_user_id IS NOT NULL` | Support: "did the customer get the order email?"                                                                |
| `notification_deliveries_unsent_idx`     | `(created_at) WHERE status IN ('queued','failed')`                         | Email-outage monitoring and redrive ([05 §8.14](05-order-payment-and-inventory-lifecycles.md#814-email-outage)) |

**Lifecycle and retention.** `queued → sent | failed`. Kept 12 months, then purged [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)]. The records the law requires (complaint acknowledgements and answers) live in §14.1 and §14.2, not here.

---

## 15. Platform and audit

### 15.1 platform_settings

**Module** `platform` · **Release** R1 · **Shop scope** none · **Lifecycle** Configuration · **Sensitivity** Internal (`platform_legal_disclosures` is Public)

Business values that operators change at runtime without a deploy. Values that move money or deadlines (commission rate, COD limits, SLA hours) are read inside the transaction that uses them and copied onto the row they affect ([03 §12.6](03-system-architecture.md#126-configuration-and-secrets)), so a change never moves an existing deadline or amount. Other reads may be cached for at most 60 seconds (AC-FR-CHK-007-3).

| Column                     | Type        | Null | Default | Notes                                  |
| -------------------------- | ----------- | ---- | ------- | -------------------------------------- |
| `key`                      | text        | no   | App     | Primary key; closed list below         |
| `value`                    | jsonb       | no   | App     | A JSON scalar or object, typed per key |
| `updated_by`               | uuid        | yes  | —       | Null for seeded values                 |
| `created_at`, `updated_at` | timestamptz | no   | `now()` |                                        |

**Every key.** All are edited only by `platform_admin` through `updatePlatformSetting` (`platform.settings.manage`), and every change writes an `audit_logs` row with the old and new value (AC-FR-ADM-011-2). "Decision owner" is who decides the value.

| Key                                | Type            | Seeded default        | Allowed range                                    | Decision owner                 | Source                                                                                                                      |
| ---------------------------------- | --------------- | --------------------- | ------------------------------------------------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `checkout_enabled`                 | boolean         | `true`                | `true`, `false`                                  | Platform admin (incident lead) | Kill switch, FR-ADM-010; Directive 2082 s8(2) requires stopping transactions after a breach [Verify-external VX-02]         |
| `maintenance_banner`               | string          | `""`                  | ≤ 280 characters; empty means none               | Platform admin                 | FR-ADM-010. Shown automatically while checkout is disabled                                                                  |
| `default_commission_rate_bp`       | integer         | `1000` (10%)          | 0–5,000                                          | Product owner                  | [Open OD-04]; placeholder until decided, must be confirmed before M7                                                        |
| `cod_max_order_value_minor`        | integer (paisa) | `2000000` (Rs 20,000) | 100,000–2,500,000                                | Product owner                  | [Assumption A-08; Open OD-18]. The cap stays below the Rs 25,000 cash-transaction limit [Verify-external VX-05]             |
| `cod_max_open_orders_per_customer` | integer         | `3`                   | 1–5                                              | Product owner                  | [Assumption A-08; OD-18]                                                                                                    |
| `cod_max_refusals`                 | integer         | `2`                   | 1–10                                             | Product owner                  | Proposed repeat-refuser rule [Assumption; OD-18]; used only if OD-18 adopts it                                              |
| `cod_refusal_window_days`          | integer         | `90`                  | 30–365                                           | Product owner                  | As above                                                                                                                    |
| `vendor_acceptance_sla_hours`      | integer         | `48`                  | 12–120                                           | Product owner                  | [Assumption A-07; OD-19]                                                                                                    |
| `return_window_days`               | integer         | `7`                   | 7–30                                             | Product owner + legal          | [Assumption A-05; OD-06]. Not below 7: CPA 2075 s14 [Verify-external VX-04]                                                 |
| `ledger_hold_days`                 | integer         | `7`                   | 0–60, and ≥ `return_window_days`                 | Product owner                  | [Assumption A-06; OD-06]. The cross-key rule is checked by `updatePlatformSetting`                                          |
| `reservation_ttl_minutes`          | integer         | `30`                  | 10–60                                            | Tech lead                      | [Assumption A-09]; eSewa hold and fallback when a provider returns no expiry                                                |
| `max_shops_per_owner`              | integer         | `3`                   | 1–10                                             | Product owner                  | [Assumption A-21]                                                                                                           |
| `single_operator_mode`             | boolean         | `false`               | `true`, `false`                                  | Product owner                  | [Assumption A-20; Open OD-14]. `false` is the safe default: maker-checker applies until someone deliberately switches it on |
| `platform_legal_disclosures`       | object          | all fields `""`       | Shape below; every field non-empty before launch | Product owner + legal          | FR-ADM-011; E-Commerce Act 2081 s4(2) [Verify-external VX-02]                                                               |

`platform_legal_disclosures` shape: `{platform_name, business_name, registered_address, registering_authority, registration_number, pan_vat_number, docscp_listing_number, contact_email, contact_phone, grievance_officer: {name, email, phone, postal_address}, special_licences: []}`. It feeds the footer page and `/grievance` (AC-FR-ADM-009-5). The launch checklist ([11](11-deployment-and-operations.md)) fails while any field is empty. s4(3) requires changes to be published within 48 hours [Verify-external VX-02], and the audit row evidences when a change was made.

**Keys and constraints.**

```sql
CREATE FUNCTION jsonb_int_between(v jsonb, lo bigint, hi bigint) RETURNS boolean
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
  WHEN 'ledger_hold_days'                 THEN jsonb_int_between(value, 0, 60)
  WHEN 'reservation_ttl_minutes'          THEN jsonb_int_between(value, 10, 60)
  WHEN 'max_shops_per_owner'              THEN jsonb_int_between(value, 1, 10)
  ELSE false END)                                               -- unknown keys are rejected
```

This is the one `jsonb` column that holds scalars, an exception to the object-only rule of [04 §2.11](04-domain-model-and-data-dictionary.md): a setting is one typed value, and the per-key CHECK is stricter than an object wrapper would be. Adding a key needs a migration that replaces the CHECK. That is deliberate, because a key the code does not know about is a bug. Ranges are sanity bounds [Assumption], not business decisions; the decision is the value. The TypeScript registry of keys in `app/modules/platform/domain/settings.ts` is compared with this CHECK by T-ADM-102 (proposed), which also writes an out-of-range value and expects 23514 mapped to 422.

**Indexes.** Primary key only (14 rows).

**Lifecycle and retention.** Seeded by the reference seeder ([04 §20.3](04-domain-model-and-data-dictionary.md)); the platform admin fills in the legal disclosures before launch. Updated in place; the history is in `audit_logs`. Never deleted.

### 15.2 idempotency_keys

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
| `idempotency_keys_expiry_idx` | `(expires_at)`                  | `platform.purge-idempotency-keys` (hourly): `DELETE … WHERE expires_at < now()` in batches of 1,000 |

**Lifecycle and retention.** Hard-deleted after `expires_at` ([04 §2.6](04-domain-model-and-data-dictionary.md)). The purge sets `orders.idempotency_key_id` to null through `ON DELETE SET NULL`, served by `orders_idempotency_key_idx` (§11.1).

### 15.3 audit_logs

**Module** `audit` · **Release** R1 (M0) · **Shop scope** `shop_id` when the action is inside a shop · **Lifecycle** Record, append-only ([04 §2.12](04-domain-model-and-data-dictionary.md)) · **Sensitivity** Personal, Internal

Who did what, to what, when, from where and why: one row per state change made by a shop member or staff member, in the same transaction (AC-J00-09), plus authentication events and system actions that move money. It is the accountability record behind FR-ADM-003, the maker-checker flags and financial corrections.

| Column          | Type        | Null | Default  | Notes                                                                                                                                                        |
| --------------- | ----------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`            | bigint      | no   | identity | `GENERATED ALWAYS AS IDENTITY` ([04 §2.1](04-domain-model-and-data-dictionary.md))                                                                           |
| `occurred_at`   | timestamptz | no   | `now()`  | Transaction time                                                                                                                                             |
| `actor_type`    | text        | no   | App      | `customer`, `shop_member`, `platform_staff`, `system`, `provider`                                                                                            |
| `actor_user_id` | uuid        | yes  | —        | No FK (below)                                                                                                                                                |
| `actor_role`    | text        | yes  | —        | Role at the time: `platform:finance_officer`, `shop:<shop_id>:manager`, `shop:<shop_id>:owner`                                                               |
| `action`        | text        | no   | App      | `<subject>.<verb>`: `shop.suspend`, `refund.approve`, `ledger.adjust`, `platform_setting.update`, `auth.login_failed`                                        |
| `subject_type`  | text        | no   | App      | `order`, `shop_order`, `refund`, `payout`, `shop`, `user`, `platform_setting`, …                                                                             |
| `subject_id`    | text        | no   | App      | The subject's id as text: a UUID, or a setting key                                                                                                           |
| `shop_id`       | uuid        | yes  | —        | No FK (below)                                                                                                                                                |
| `request_id`    | text        | yes  | —        | Links to logs and the problem body                                                                                                                           |
| `ip_hash`       | bytea       | yes  | —        | Keyed HMAC-SHA256 of the client IP; correlates abuse without storing addresses                                                                               |
| `changes`       | jsonb       | no   | `'{}'`   | Redacted before and after values. Never plaintext of `*_enc` columns, passwords, tokens or full phone numbers; flags such as `{"flags":["single_operator"]}` |
| `reason`        | text        | yes  | —        | Mandatory for suspensions, adjustments, manual resolutions                                                                                                   |

There are no foreign keys, matching [04 §4.5](04-domain-model-and-data-dictionary.md): the audit trail must survive whatever happens to the rows it describes (anonymisation, the retention purge of other tables), and it must record actions whose subject never existed, such as a failed login for an unknown email.

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
CONSTRAINT audit_logs_reason_check CHECK (reason IS NULL OR char_length(reason) <= 1000)
```

A customer actor may have no user id: anonymous authentication attempts are recorded with `actor_type = 'customer'` and a null id. Staff and shop actions always carry one.

**Indexes.**

| Index                         | Definition                                                 | Query served                                                                                      |
| ----------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `audit_logs_subject_idx`      | `(subject_type, subject_id, id DESC)`                      | History of one order, refund, shop or user on its admin page                                      |
| `audit_logs_actor_idx`        | `(actor_user_id, id DESC) WHERE actor_user_id IS NOT NULL` | "What did this staff member do" (`listAuditLogs?actor=`)                                          |
| `audit_logs_shop_idx`         | `(shop_id, id DESC) WHERE shop_id IS NOT NULL`             | Activity inside one shop                                                                          |
| `audit_logs_action_idx`       | `(action, id DESC)`                                        | Filter by action, for example every `refund.approve`                                              |
| `audit_logs_occurred_at_brin` | BRIN `(occurred_at)`                                       | Date-range browsing: `WHERE occurred_at >= :from AND occurred_at < :to ORDER BY id DESC LIMIT 50` |

The BRIN index is a few pages in size because rows arrive in time order. It cannot serve an exact lookup, which the B-tree indexes above do.

**Lifecycle and retention.** Insert-only for every role ([04 §2.12](04-domain-model-and-data-dictionary.md), T-ARCH-012). Financial and order actions are kept at least 6 years ([04 §19.3](04-domain-model-and-data-dictionary.md), [Verify-external VX-08]). Authentication events (`auth.*`) are the bulk of the rows and are kept 2 years [Assumption; [04 §19.3](04-domain-model-and-data-dictionary.md)]. Only the retention command deletes rows, and it writes an audit row saying what it removed.

### 15.4 rate_limits (limiter store)

**Module** `platform` (package-managed) · **Release** R0 · **Shop scope** none · **Lifecycle** Ephemeral · **Sensitivity** Personal (pseudonymised keys)

The database store of `@adonisjs/limiter` 3.0.1, chosen over Redis because PostgreSQL is the only stateful service in R1 (canon §6.1; OD-10 resolved). The table keeps the shape of the package's migration stub, as [04 §2.1](04-domain-model-and-data-dictionary.md) allows for package tables [Verified-doc `@adonisjs/limiter` 3.0.1 `build/make/migration/rate_limits.stub`, <https://registry.npmjs.org/@adonisjs/limiter/-/limiter-3.0.1.tgz>]:

| Column   | Type         | Null | Default | Notes                            |
| -------- | ------------ | ---- | ------- | -------------------------------- |
| `key`    | varchar(255) | no   | —       | Primary key; the limiter key     |
| `points` | integer      | no   | `0`     | Points consumed in the window    |
| `expire` | bigint       | yes  | —       | Window end in epoch milliseconds |

`varchar(255)` breaks the text-plus-CHECK rule of [04 §2.8](04-domain-model-and-data-dictionary.md) on purpose: the package owns this shape.

**Key rule.** Limiter keys are built by DripNepal code, not by the package, so the application hashes the identifying part: `login:acct_ip:<hex HMAC(email + '|' + ip)>` instead of the raw email and IP. Two reasons. The table then holds no email addresses or IPs. And a 254-character email plus an IPv6 address would exceed 255 characters, fail with SQLSTATE 22001 and turn a login attempt into a 500. A hex HMAC-SHA256 is always 64 characters. T-SEC-101 (proposed) logs in with a 254-character email from an IPv6 address.

**Keys and constraints.** `rate_limits_pkey PRIMARY KEY (key)` from the stub.

**Indexes.** Primary key only. It serves every consume and penalize call.

**Lifecycle and retention.** The store option `clearExpiredByTimeout` "automatically clear[s] expired keys every 5 minutes" [Verified-doc limiter 3.0.1 `build/src/types.d.ts`] and is enabled. The table holds only live windows, a few thousand rows at most. Because it is in `public`, `schema:generate` emits a class for it; no model uses that class.

### 15.5 pg-boss schema (`pgboss`)

**Module** `platform` (package-managed) · **Release** R0 · **Lifecycle** Ephemeral · **Sensitivity** Internal

pg-boss 12 stores queues, jobs and schedules in its own schema, `pgboss` (canon §6.2). pg-boss creates and migrates it; DripNepal migrations never touch it, and this document does not describe it column by column. pg-boss "uses declarative list-based partitioning to expose a single logical `job` table" [Verified-doc pg-boss documentation, Introduction, <https://github.com/timgit/pg-boss/tree/master/docs>]. The job table is DripNepal's transactional outbox: jobs are sent inside the business transaction, and "if the transaction rolls back, so does the job" (ADR-0010; [03 §10.1](03-system-architecture.md#101-transactional-send-the-job-table-is-the-outbox)).

Rules that concern data:

- **Payloads carry identifiers, not data.** A job payload holds ids (`{"shop_order_id": "…"}`) and the handler reads current rows. No email addresses, phone numbers, addresses or tokens go into a payload, because the job table is copied into every backup and kept after completion. Queues that must carry a token (for example an email-verification link) delete completed jobs after one day ([03 §9](03-system-architecture.md#9-asynchronous-work)).
- **Retention.** pg-boss defaults keep queued jobs 14 days (`retentionSeconds`) and delete completed jobs after 7 days (`deleteAfterSeconds`) [Verified-doc <https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md>]. Dead-letter queues (`dlq.<queue>`) keep failed payloads for redrive under the same rules.
- **Not in `database/schema.ts`.** `schema:generate` scans only the connection's search path, `public` by default ([04 §2.15](04-domain-model-and-data-dictionary.md)), so no Lucid class is generated for pg-boss tables and none may be written.
- **Privileges** [Assumption; confirm in the M0 spike]: pg-boss installs and migrates its schema from the release step under the migrator role, and the runtime role gets DML on `pgboss.*` only, so the web and worker processes cannot alter it.
- **Fallback.** If the M0 spike shows that a Lucid transaction cannot be handed to pg-boss's Knex adapter, an `outbox_events` table is added to `public` with a relay job, and it is defined here at that point (canon §8).
- **Restore.** After a point-in-time restore, pg-boss replays jobs that were queued at the restore point. Every handler is idempotent (compare-and-set or dedupe key), so a replay changes nothing twice ([03 §10.3](03-system-architecture.md#103-at-least-once-delivery-and-idempotent-handlers)).
