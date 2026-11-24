import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

/*
 * OD-44's own-shop check (docs/07 §4.1 item 4, §4.7; decided 2026-11-23,
 * option (b) with the `single_operator_mode` exception), as the admin
 * actions receive it. The check needs the shops, the settings and the
 * staff member's TOTP secret, which live above the modules whose actions
 * call it (logistics ranks below identity and shops, docs/09 §2.2), so the
 * controller builds it (`ownShopCheck` in the shops module) and passes it
 * in, as `UnfinishedShipmentsCheck` is passed into logistics.
 *
 * An action calls it inside its transaction, once it has found the shops
 * the change touches and before it writes: it throws when the staff member
 * owns or works in one of them and the exception does not apply, and
 * returns the flags the action spreads into its audit row's `changes`
 * (`{"flags":["single_operator"]}` under the exception, docs/04a §15.3).
 * Null IDs (a platform-owned account, an unmatched courier reading) are
 * nobody's shop.
 */
export type AuditFlags = { flags?: ['single_operator'] }

export type OwnShopCheck = (
  trx: TransactionClientContract,
  shopIds: readonly (string | null)[]
) => Promise<AuditFlags>
