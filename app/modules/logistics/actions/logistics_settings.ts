import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, VersionConflict } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import { withTx } from '#modules/platform/tx'
import { logisticsSettings, type SettingsView } from '#modules/logistics/queries'

/*
 * `shop_logistics_settings` (docs/04a §9.11, docs/06 §13.8; M6). A shop with
 * no row is `manual` and enabled at version 0; the first save creates the row
 * with `If-Match: "0"`. R1 offers `manual` and `vendor` only (decided
 * 2026-11-21: no platform-owned accounts in R1), so `platform` is refused
 * before the database would. The `is_enabled` switch is platform staff's, a
 * locked upsert that bumps `version` without `If-Match`, so a seller edit
 * loaded before it gets 412.
 */

const auditRow = (actor: Actor) => ({
  actorType: actor.type,
  actorUserId: actor.userId,
  actorRole: actor.role,
  requestId: actor.requestId,
  ipHash: actor.ipHash ?? null,
})

function invalid(field: string, code: string, message: string) {
  return new DomainError('VALIDATION_FAILED', { errors: [{ field, code, message }] })
}

async function settingsIn(trx: TransactionClientContract, shopId: string): Promise<SettingsView> {
  const row = await trx.from('shop_logistics_settings').where('shop_id', shopId).first()
  return row
    ? {
        shopId,
        fulfillmentMode: row.fulfillment_mode,
        defaultAccountId: row.default_account_id,
        isEnabled: row.is_enabled,
        version: row.version,
      }
    : { shopId, fulfillmentMode: 'manual', defaultAccountId: null, isEnabled: true, version: 0 }
}

export async function replaceLogisticsSettings<T>(
  command: {
    shopId: string
    fulfillmentMode: 'manual' | 'vendor' | 'platform'
    defaultAccountId: string | null
    expectedVersion: number
  },
  context: { actor: Actor; present: (settings: SettingsView) => T }
) {
  if (command.fulfillmentMode === 'platform') {
    throw invalid(
      'fulfillment_mode',
      'not_offered',
      'Platform courier accounts are not offered yet. Use your own courier account.'
    )
  }
  if (command.fulfillmentMode === 'manual' && command.defaultAccountId !== null) {
    throw invalid('default_account_id', 'not_allowed', 'The manual mode has no courier account.')
  }
  if (command.fulfillmentMode === 'vendor' && command.defaultAccountId === null) {
    throw invalid('default_account_id', 'required', 'Choose the courier account to book with.')
  }
  return withTx(async (trx) => {
    await trx.rawQuery('SELECT id FROM shops WHERE id = ? FOR NO KEY UPDATE', [command.shopId])
    const current = await trx
      .from('shop_logistics_settings')
      .where('shop_id', command.shopId)
      .forUpdate()
      .first()
    const version = current?.version ?? 0
    if (version !== command.expectedVersion) {
      throw new VersionConflict(
        context.present(await settingsIn(trx, command.shopId)) as Record<string, unknown>
      )
    }
    if (command.defaultAccountId) {
      const usable = await trx
        .from('logistics_account_shops as las')
        .join('logistics_accounts as la', 'la.id', 'las.account_id')
        .where({
          'las.account_id': command.defaultAccountId,
          'las.shop_id': command.shopId,
          'las.is_active': true,
        })
        .where('la.status', 'active')
        .where('la.owner_type', 'shop')
        .first()
      if (!usable) {
        throw invalid(
          'default_account_id',
          'account_not_usable',
          'This courier account cannot be used: it is not active, or not this shop’s.'
        )
      }
    }
    const values = {
      fulfillment_mode: command.fulfillmentMode,
      default_account_id: command.defaultAccountId,
      default_account_owner_type: command.defaultAccountId ? 'shop' : null,
    }
    if (current) {
      await trx
        .from('shop_logistics_settings')
        .where({ shop_id: command.shopId, version })
        .update({ ...values, version: trx.raw('version + 1'), updated_at: trx.raw('now()') })
    } else {
      await trx.table('shop_logistics_settings').insert({ shop_id: command.shopId, ...values })
    }
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'shop_logistics_settings.update',
      subjectType: 'shop_logistics_settings',
      subjectId: command.shopId,
      shopId: command.shopId,
      changes: {
        fulfillment_mode: {
          from: current?.fulfillment_mode ?? 'manual',
          to: command.fulfillmentMode,
        },
        default_account_id: {
          from: current?.default_account_id ?? null,
          to: command.defaultAccountId,
        },
      },
    })
    return context.present(await settingsIn(trx, command.shopId))
  })
}

export async function setShopLogisticsEnabled<T>(
  command: { shopId: string; isEnabled: boolean; reason: string },
  context: { actor: Actor; present: (settings: SettingsView) => T }
) {
  return withTx(async (trx) => {
    const shop = await trx.rawQuery('SELECT id FROM shops WHERE id = ? FOR NO KEY UPDATE', [
      command.shopId,
    ])
    if (shop.rows.length === 0) throw new DomainError('NOT_FOUND')
    const current = await trx
      .from('shop_logistics_settings')
      .where('shop_id', command.shopId)
      .forUpdate()
      .first()
    const before = current?.is_enabled ?? true
    if (before !== command.isEnabled) {
      if (current) {
        await trx
          .from('shop_logistics_settings')
          .where('shop_id', command.shopId)
          .update({
            is_enabled: command.isEnabled,
            version: trx.raw('version + 1'),
            updated_at: trx.raw('now()'),
          })
      } else {
        await trx.table('shop_logistics_settings').insert({
          shop_id: command.shopId,
          // Version 1 already differs from the "0" a seller's form loaded before the row existed.
          is_enabled: command.isEnabled,
        })
      }
      await recordAudit(trx, {
        ...auditRow(context.actor),
        action: 'shop_logistics_settings.enable',
        subjectType: 'shop_logistics_settings',
        subjectId: command.shopId,
        shopId: command.shopId,
        changes: { is_enabled: { from: before, to: command.isEnabled } },
        reason: command.reason,
      })
    }
    return context.present(await settingsIn(trx, command.shopId))
  })
}

export { logisticsSettings }
