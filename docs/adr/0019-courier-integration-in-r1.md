# ADR-0019: Courier integration in R1: a courier registry, logistics accounts owned by the platform or a shop, encrypted credentials

Status: Draft v1 (2026-11-05)

## Status

- **Decision status:** Accepted for the schema (decisions 1 to 5, 7 and 8), which the E4 baseline builds. **Proposed** for the `CourierProvider` port and its adapter (decision 6), pending VX-16.
- **Date:** 2026-11-05
- **Deciders:** product owner (OD-56), lead developer
- **Supersedes / superseded by:** — / —. Reverses the R1 part of Q5 ("no courier API at MVP") and the "Courier API integrations" non-goal of [01 §5.4](../01-product-requirements.md#54-explicit-non-goals).
- **Related open items:** OD-58 (COD on platform-owned accounts), VX-16 (NCM API), VX-17 (pickups from many vendors on one account), VX-18 (COD remittance), OD-07 and OD-30 (who bears courier costs and lost parcels), OD-55 (v1 data into the baseline)

## Context

**Confirmed answers until now** ([00 §3.2](../00-context-assumptions-and-questions.md#32-product-owner-answers-q1q8-and-their-consequences)): vendors pack and ship with their own couriers and type tracking in by hand; courier APIs were R3 (FR-FUL-004), with the trigger "two couriers with documented APIs and over 30% of shops on one" (Q5). On 2026-11-05 the product owner decided OD-56: logistics is essential to the first marketplace release, so courier integration moves into R1 with a reduced scope ([risks §2.3](../risks-and-open-decisions.md#23-decision-log)).

**What the couriers publish** [[research: nepal-regulatory-locale](../research/nepal-regulatory-locale.md), accessed 2026-09-25]:

- Nepal Can Move (NCM) has an API for registered vendors: a third-party guide says vendors generate a production token in the NCM portal under Resources → API Integration. No public documentation was found, and probed documentation paths returned 404 [Verify-external VX-16].
- Upaya offers API integration to registered vendors, with documentation on request. Pathao's Nepal merchant API is unconfirmed.
- Nothing published says whether one NCM merchant account can book pickups from many vendors (VX-17), or how NCM remits COD (VX-18).

**Two ways to own an account.** A shop may already have its own NCM merchant account. DripNepal may also hold one and let chosen shops book through it. The second changes who receives COD cash: until now the vendor always held it, so the platform held no customer money in R1 ([00 §3.3](../00-context-assumptions-and-questions.md#33-the-cod-consequence-vendors-hold-the-cash-so-the-ledger-must-go-negative)), and REG-27 bars collecting for vendors before VX-01 is answered. That question is OD-58.

**Secrets.** Courier credentials are long-lived merchant secrets. Hosting is one VPS with managed PostgreSQL and no secret manager ([ADR-0016](0016-hosting-single-region-portable.md)). Sensitive columns are already encrypted by the application with the `DATA_ENCRYPTION_KEYS` ring ([04 §2.9](../04-domain-model-and-data-dictionary.md#29-sensitive-column-encryption-and-blind-indexes)).

**Repository** [Verified-repo `database/migrations`, 2026-11-05]: the v1 schema has no shipment, courier or pickup tables; `orders` holds one row per shop, grouped by `checkout_id`. The E4 baseline ([ADR-0011](0011-schema-rebaseline-before-production.md)) replaces it, and OD-55 decides how v1 data moves.

## Decision

1. **A courier registry, not courier columns.** `logistics_providers` has one row per courier (`code`, `name`, `is_active`, `capabilities`). NCM is a reference-seeder row with code `ncm` [Assumption A-53], never a constant in a migration. No table has a column specific to one courier: the courier's identifiers and statuses are stored as opaque text (`external_account_ref`, `external_shipment_id`, `provider_event_key`, `raw_status`).
2. **Two ownership models in one table.** `logistics_accounts.owner_type` is `platform` or `shop`, and a CHECK makes `shop_id` null exactly when the owner is the platform. A guard trigger stops the provider, owner type and owner shop from changing after insert, so a shipment's account always names the same owner.
3. **One table says who may use an account.** `logistics_account_shops` has a row for every shop allowed to use every account: exactly one row, for the owner, on a shop-owned account; one row per allowed shop on a platform-owned account. The row carries the account's owner type and, for a shop-owned account, its owner shop, checked by composite foreign keys to `logistics_accounts`; a CHECK then makes the owner the only shop a shop-owned account can list, and requires the owner-shop copy to be null exactly when the owner type is `platform`, so the owner-shop foreign key is always checked on a shop-owned row. `logistics_accounts` carries `UNIQUE (id, owner_type)` and `UNIQUE (id, shop_id)` as the targets of these keys. The action that creates a shop-owned account inserts the owner's row in the same transaction. Rows are deactivated (`is_active = false`), never deleted. `shipments` and `shop_logistics_settings` reference `(account_id, shop_id)` of this table through composite foreign keys, so the database refuses a shipment or a default account that the shop was never allowed to use. Whether the row is still active when a shipment is created is checked by the action.
4. **Shipments keep what they used.** `shipments.logistics_account_id` (null in the `manual` mode) and `shipments.pickup_address_id` are written when the shipment is created. Changing a shop's default account or default pickup address never changes an existing shipment. Pickup addresses are `shop_addresses` rows with `purpose = 'pickup'`, which already encrypt the contact phone and use the location codes ([04a §6.6](../04a-data-dictionary-tables.md#66-shop_addresses)). Three rules of 04a §6.6 change with the data model: a shop may have several active pickup addresses; once a shipment references a pickup address, an edit archives that row and inserts a new one instead of changing it in place; and the 30-day purge of archived addresses skips a row that a shipment references, which is then kept as long as the shipment ([04 §19.3](../04-domain-model-and-data-dictionary.md#193-retention-schedule)).
5. **Credentials are encrypted in the database.** `logistics_accounts.credentials_enc` holds the courier credentials as ciphertext in the 04 §2.9 format, with the additional authenticated data `logistics_accounts.credentials_enc` and the `DATA_ENCRYPTION_KEYS` ring. No transformer, log line, job payload or error body includes it, and the model hides it from serialisation. Only the courier adapter decrypts it, for the call that needs it. No plaintext token or password column exists. The encryption code is built with the adapter, not with the schema.
6. **`CourierProvider` port (Proposed until VX-16).** Courier calls go through a port in `app/modules/logistics/providers/`, shaped like `PaymentProvider` ([ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md)): book, cancel, look up tracking and, where the courier offers it, verify a notification, with declared capabilities. Outbound calls run outside database transactions with the timeouts of [03 §11.4](../03-system-architecture.md#114-timeouts-and-simple-circuit-breaking), and only inside the adapter (T-SEC-016). A courier status is mapped by a pure function to a normalised shipment status, and the raw status is kept beside it. The tables that booking and tracking need beyond decisions 1 to 4 (booking attempts, a courier event inbox, branch codes) are specified in 04a before the M6 code that uses them.
7. **The `manual` mode stays.** `shop_logistics_settings.fulfillment_mode` is `platform`, `vendor` or `manual`. `manual` is the vendor-entered flow of FR-FUL-001 to 003 and the default for a new shop [Assumption A-54]. No setting creates a courier shipment by itself.
8. **COD on platform-owned accounts waits for OD-58.** A shipment records the account that carried it and the COD amount the courier collects, so a manual reconciliation is possible. No ledger entry, settlement or payout depends on it in R1, and until OD-58 is decided a platform-owned account books no live COD shipment.

## Alternatives considered

| Alternative                                                              | Why rejected                                                                                                                                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Keep courier APIs in R3                                                  | The product owner decided otherwise (OD-56).                                                                                                                                         |
| Courier-specific columns on `shipments` or the provider table            | Ties the schema to NCM's undocumented API (VX-16); a second courier would need a migration.                                                                                          |
| Shop-owned accounts authorised only through `logistics_accounts.shop_id` | "This account is allowed for this shop" becomes an OR across two tables, which no foreign key can check; the shipment's account would be checked only by code.                       |
| A reference to an external secret store (`credential_secret_ref`)        | Hosting has no secret store ([ADR-0016](0016-hosting-single-region-portable.md)), and running one adds a service that one person must operate (03 D1). Revisit if hosting gains one. |
| Plaintext credential column protected by grants                          | The secret would sit in every backup and replica in clear text.                                                                                                                      |
| A separate `shop_pickup_locations` table                                 | Duplicates `shop_addresses` with `purpose = 'pickup'`, its encryption and its location codes.                                                                                        |

## Consequences

**Positive**

- One schema covers the `manual` mode, shop-owned accounts and platform-owned accounts, and a shop can change mode without touching past shipments.
- A second courier is a provider row and an adapter, not a migration.
- The database, not code review, refuses a shipment on an account the shop was never allowed to use.

**Negative**

- M6 grows: account and settings management, booking, tracking and the courier status mapping (R-12, R-33).
- `credentials_enc` joins the key-rotation set of 04 §2.9.
- The `logistics` module owns tables that reference `shops`, as it already does for `shop_delivery_coverage`; seller authorisation stays in the controller through the seller context ([03 §4.1](../03-system-architecture.md#41-dependency-diagram)).

**Risks**

- _NCM's API, multi-vendor pickups or COD terms do not fit_ (VX-16 to VX-18, R-33). The `manual` mode stays available to every shop, and platform-owned accounts are offered only if VX-17 allows them.
- _COD on platform-owned accounts makes DripNepal hold customer cash_ (OD-58, REG-27, VX-01). The safe default keeps COD off those accounts until OD-58 is decided.

## When to revisit

- VX-16 answered: accept decision 6 or change the port.
- A second courier is added.
- Hosting gains a secret store: compare it with decision 5.
- OD-58 chooses option (b): revisit the ledger of [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md).
- Partial shipments (FR-FUL-005, R2) lift the one-shipment-per-shop-order rule.

## Verification

The test IDs are registered in [10 §6](../10-testing-and-quality-gates.md#6-test-id-registry) and specified with the tables in [04a](../04a-data-dictionary-tables.md). They cover:

- each CHECK and composite foreign key of decisions 2 to 4, with rows that break them (23514, 23503): T-SHOP-111, T-SHOP-113, T-FUL-102;
- the guard trigger of decision 2 (P0001): T-SHOP-111;
- a second shop added to a shop-owned account, and a shop-owned row with a null owner-shop copy, both refused by the composite foreign keys and CHECK of decision 3: T-SHOP-112;
- an edit of a pickup address that a shipment references, which leaves the shipment's row unchanged, and the purge, which keeps that row: T-SHOP-006;
- `shipments_booking_guard`, which keeps what a booking used (P0001): T-FUL-103;
- `credentials_enc` absent from every serialised model, transformer, log line and job payload: T-SEC-040; its ciphertext format CHECK: T-SHOP-111; the two proposed permissions: T-SEC-041;
- T-SEC-016: no outbound HTTP outside `providers/` folders.

## Related

- [risks: OD-56, OD-57, OD-58, VX-16 to VX-18, R-33](../risks-and-open-decisions.md#22-decision-table)
- [01 FR-FUL-004](../01-product-requirements.md#fr-ful-004-courier-api-integration), [03 §4.4](../03-system-architecture.md#44-module-responsibilities), [04a §9](../04a-data-dictionary-tables.md#9-logistics-and-locations), [04a §11.5](../04a-data-dictionary-tables.md#115-shipments)
- [ADR-0009](0009-multi-shop-orders-and-vendor-ledger.md), [ADR-0011](0011-schema-rebaseline-before-production.md), [ADR-0012](0012-payment-provider-isolation-verify-by-lookup.md), [ADR-0016](0016-hosting-single-region-portable.md)
