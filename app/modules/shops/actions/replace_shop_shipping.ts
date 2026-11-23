import { DomainError, VersionConflict } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit, type AuditValue } from '#modules/audit/actions/record_audit'
import { replaceShippingRows, type ShippingChanges } from '#modules/logistics/actions/shop_shipping'
import type { Actor } from '#modules/platform/actor'
import { withTx } from '#modules/platform/tx'
import { shopGateAllows } from '#modules/shops/permissions'
import {
  shopShippingState,
  type SellerContext,
  type ShopShippingState,
} from '#modules/shops/queries'

/*
 * `replaceShopShipping` ⟳ (docs/06 §13.5, §8; 01 FR-SHOP-004; 04a §9.6,
 * §9.7; R1-S part 1c), the shops entry action. Identity-free: the caller's
 * place in the shop comes from `seller_context` (`command.shop`), and the
 * controller has already checked `shop.shipping.manage` and the "profile,
 * shipping" status gate (07 §4.3, §4.4; the owner alone while
 * `pending_review` or `rejected`, OD-47).
 *
 * The delivery rows belong to `logistics` (04a §9.6, §9.7), the version to
 * `shops`, so this action orchestrates (docs/09 §2.3 rule 1): in one
 * transaction,
 * 1. the shop row is locked `FOR NO KEY UPDATE` (level 0 of docs/05 §4.4),
 *    as `updateShopProfile` locks it, so the two serialise on
 *    `shops.version`;
 * 2. the status gate again, on the locked row: a suspension or closure that
 *    committed after `seller_context` read the shop wins (403
 *    `SHOP_NOT_ACTIVE`);
 * 3. ⟳: the locked `version` must equal the `If-Match` version, else 412
 *    `VERSION_CONFLICT` with `current`, the shipping as `getShopShipping`
 *    shows it (06 §8). Nothing is written;
 * 4. `logistics.replaceShippingRows` checks the changes against the
 *    reference data and the rules of 04a §9.6 on the result, and writes the
 *    sets that differ;
 * 5. when a set was written, `shops.version + 1` by compare-and-set on the
 *    version and status the lock read, and one `shop.shipping_replace` audit
 *    row (proposed, docs/04a §15.3) with the from and to values of each
 *    written set (district and zone codes, fees in paisa and day counts: no
 *    personal value). A request that changes nothing writes nothing and
 *    keeps the version.
 * Checkout reads the rows for new quotes only; placed shop orders keep their
 * fee and zone (AC-FR-SHOP-004-2). Verified by T-SHOP-010, T-SHOP-109,
 * T-API-004 and T-SEC-031.
 */
export type ReplaceShopShippingCommand = {
  // The shop `seller_context` resolved, with the caller's place in it.
  shop: SellerContext
  // From `If-Match`; -1 for a tag that names no version (06 §8).
  expectedVersion: number
  changes: ShippingChanges
}

export async function replaceShopShipping<T extends Record<string, unknown>>(
  command: ReplaceShopShippingCommand,
  context: { actor: Actor; present: (state: ShopShippingState) => T }
): Promise<T> {
  const { shop, changes } = command
  const { actor } = context
  if (!actor.userId) throw new InvariantViolation('replaceShopShipping needs the acting user')

  return withTx(async (trx) => {
    const locked = await trx.rawQuery(
      'SELECT status, suspension_mode, version FROM shops WHERE id = ? FOR NO KEY UPDATE',
      [shop.id]
    )
    const row: { status: string; suspension_mode: string | null; version: number } | undefined =
      locked.rows[0]
    // `seller_context` has just found the shop, and shops are never deleted while members remain.
    if (!row) throw new DomainError('NOT_FOUND')

    const lockedShop = { ...shop, status: row.status, suspensionMode: row.suspension_mode }
    if (!shopGateAllows(lockedShop, 'profile')) {
      throw new DomainError('SHOP_NOT_ACTIVE', {
        extensions: { shop_status: row.status, suspension_mode: row.suspension_mode },
      })
    }

    const present = async () => context.present(await shopShippingState(shop.id, { client: trx }))
    if (row.version !== command.expectedVersion) throw new VersionConflict(await present())

    const written = await replaceShippingRows(trx, shop.id, changes)
    if (!written.coverage && !written.rates) return present()

    const updated: { id: string }[] = await trx
      .from('shops')
      .where({ id: shop.id, version: row.version, status: row.status })
      .update({ version: trx.knexRawQuery('version + 1'), updated_at: trx.knexRawQuery('now()') }, [
        'id',
      ])
    // The row is locked and was read with this version and status, so the update cannot miss.
    if (updated.length !== 1) throw new InvariantViolation('the locked shop was not updated')

    const audited: Record<string, AuditValue> = {}
    if (written.coverage) audited.coverage = written.coverage
    if (written.rates) audited.rates = written.rates
    await recordAudit(trx, {
      actorType: actor.type,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'shop.shipping_replace',
      subjectType: 'shop',
      subjectId: shop.id,
      shopId: shop.id,
      requestId: actor.requestId,
      ipHash: actor.ipHash ?? null,
      changes: audited,
    })
    return present()
  })
}
