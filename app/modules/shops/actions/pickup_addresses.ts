import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import db from '@adonisjs/lucid/services/db'
import { DomainError, InvalidStateTransition } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import { encryptField } from '#modules/platform/crypto/field_crypto'
import { withTx } from '#modules/platform/tx'

/*
 * Pickup addresses (docs/04a §6.6, docs/06 §13.8; M6, OD-56): a shop has one
 * or more active pickup addresses, exactly one of them the default. The
 * contact phone, area and landmark are encrypted with AAD
 * `shop_addresses.<column>`. Each operation locks the shop row first (docs/05
 * §4.4 level 0), then the address `FOR UPDATE`, so a booking that references
 * the address (its foreign-key check takes `FOR KEY SHARE`) serialises with
 * the "a shipment references it" test.
 *
 * An address a shipment references is never edited in place (INV-30): the
 * edit archives that row and inserts the edited copy, which takes over its
 * default flag (T-SHOP-006). The shipments belong to `orders`, above this
 * module, so the caller passes that check in. M2's profile operations reuse
 * this helper for the pickup address they carry.
 */

export type AddressFields = {
  label: string | null
  contactName: string
  contactPhone: string
  provinceCode: string
  districtCode: string
  localLevelCode: string
  wardNo: number
  areaTole: string
  streetLandmark: string | null
}

export type ReferencedCheck = (
  trx: TransactionClientContract,
  addressId: string
) => Promise<boolean>

const aad = (column: string) => `shop_addresses.${column}`

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

// The location chain and the ward, before the composite keys would refuse them (docs/04a §5.5).
async function checkLocation(trx: TransactionClientContract, fields: AddressFields) {
  const level = await trx
    .from('local_levels as l')
    .join('districts as d', 'd.code', 'l.district_code')
    .where('l.code', fields.localLevelCode)
    .select('l.district_code', 'd.province_code', 'l.ward_count')
    .first()
  if (
    !level ||
    level.district_code !== fields.districtCode ||
    level.province_code !== fields.provinceCode
  ) {
    throw invalid(
      'local_level_code',
      'location_mismatch',
      'The province, district and local level do not match.'
    )
  }
  if (fields.wardNo < 1 || fields.wardNo > level.ward_count) {
    throw invalid('ward_no', 'ward_out_of_range', 'This local level has no such ward.')
  }
}

function columns(fields: AddressFields) {
  return {
    label: fields.label,
    contact_name: fields.contactName,
    contact_phone_enc: encryptField(fields.contactPhone, aad('contact_phone_enc')),
    province_code: fields.provinceCode,
    district_code: fields.districtCode,
    local_level_code: fields.localLevelCode,
    ward_no: fields.wardNo,
    area_tole_enc: encryptField(fields.areaTole, aad('area_tole_enc')),
    street_landmark_enc: fields.streetLandmark
      ? encryptField(fields.streetLandmark, aad('street_landmark_enc'))
      : null,
  }
}

async function lockShop(trx: TransactionClientContract, shopId: string) {
  await trx.rawQuery('SELECT id FROM shops WHERE id = ? FOR NO KEY UPDATE', [shopId])
}

async function clearDefault(trx: TransactionClientContract, shopId: string) {
  await trx
    .from('shop_addresses')
    .where({ shop_id: shopId, purpose: 'pickup', is_default: true })
    .whereNull('archived_at')
    .update({ is_default: false })
}

export async function createPickupAddress(
  command: { shopId: string; fields: AddressFields; isDefault: boolean },
  actor: Actor
) {
  return withTx(async (trx) => {
    await lockShop(trx, command.shopId)
    await checkLocation(trx, command.fields)
    const existing = await trx
      .from('shop_addresses')
      .where({ shop_id: command.shopId, purpose: 'pickup' })
      .whereNull('archived_at')
      .select('id')
    // The shop's first pickup address is its default (docs/06 §13.8).
    const isDefault = command.isDefault || existing.length === 0
    if (isDefault) await clearDefault(trx, command.shopId)
    const [row] = await trx
      .table('shop_addresses')
      .insert({
        shop_id: command.shopId,
        purpose: 'pickup',
        is_default: isDefault,
        ...columns(command.fields),
      })
      .returning('id')
    await recordAudit(trx, {
      ...auditRow(actor),
      action: 'shop_address.create',
      subjectType: 'shop_address',
      subjectId: row.id,
      shopId: command.shopId,
      changes: {
        purpose: 'pickup',
        is_default: isDefault,
        changed: ['contact_phone_enc', 'area_tole_enc'],
      },
    })
    return row.id as string
  })
}

async function lockAddress(trx: TransactionClientContract, shopId: string, addressId: string) {
  const row = await trx
    .from('shop_addresses')
    .where({ id: addressId, shop_id: shopId, purpose: 'pickup' })
    .forUpdate()
    .first()
  if (!row) throw new DomainError('NOT_FOUND')
  if (row.archived_at) throw new InvalidStateTransition('archived', [])
  return row
}

/*
 * Edits the fields (when given) and/or makes the address the default. Returns
 * the address's ID, a new one when the edit replaced a referenced row.
 */
export async function updatePickupAddress(
  command: {
    shopId: string
    addressId: string
    fields: AddressFields | null
    isDefault: boolean | null
  },
  context: { actor: Actor; referencedByShipment: ReferencedCheck }
) {
  return withTx(async (trx) => {
    await lockShop(trx, command.shopId)
    const row = await lockAddress(trx, command.shopId, command.addressId)
    if (command.isDefault === false && row.is_default) {
      throw invalid(
        'is_default',
        'default_required',
        'Make another pickup address the default instead.'
      )
    }
    const makeDefault = command.isDefault === true && !row.is_default
    let id = row.id as string
    if (command.fields) {
      await checkLocation(trx, command.fields)
      if (await context.referencedByShipment(trx, row.id)) {
        // Archive and copy: the shipment keeps the address its parcel left from (INV-30).
        const keepDefault = row.is_default as boolean
        await trx
          .from('shop_addresses')
          .where('id', row.id)
          .update({ is_default: false, archived_at: trx.raw('now()') })
        if (makeDefault) await clearDefault(trx, command.shopId)
        const [copy] = await trx
          .table('shop_addresses')
          .insert({
            shop_id: command.shopId,
            purpose: 'pickup',
            is_default: keepDefault || makeDefault,
            ...columns(command.fields),
          })
          .returning('id')
        id = copy.id as string
      } else {
        if (makeDefault) await clearDefault(trx, command.shopId)
        await trx
          .from('shop_addresses')
          .where('id', row.id)
          .update({ ...columns(command.fields), ...(makeDefault ? { is_default: true } : {}) })
      }
    } else if (makeDefault) {
      await clearDefault(trx, command.shopId)
      await trx.from('shop_addresses').where('id', row.id).update({ is_default: true })
    }
    await recordAudit(trx, {
      ...auditRow(context.actor),
      action: 'shop_address.update',
      subjectType: 'shop_address',
      subjectId: id,
      shopId: command.shopId,
      changes: {
        replaced: id === row.id ? null : row.id,
        is_default: { from: row.is_default, to: makeDefault ? true : row.is_default },
        ...(command.fields
          ? { changed: ['contact_phone_enc', 'area_tole_enc', 'street_landmark_enc'] }
          : {}),
      },
    })
    return id
  })
}

export async function archivePickupAddress(
  command: { shopId: string; addressId: string },
  actor: Actor
) {
  await withTx(async (trx) => {
    await lockShop(trx, command.shopId)
    const row = await lockAddress(trx, command.shopId, command.addressId)
    if (row.is_default) {
      throw new DomainError('INVALID_STATE_TRANSITION', {
        detail: 'A shop always keeps a default pickup address. Make another the default first.',
        extensions: { current_status: 'default', allowed_events: [] },
      })
    }
    await trx
      .from('shop_addresses')
      .where('id', row.id)
      .update({ archived_at: trx.raw('now()') })
    await recordAudit(trx, {
      ...auditRow(actor),
      action: 'shop_address.archive',
      subjectType: 'shop_address',
      subjectId: row.id,
      shopId: command.shopId,
    })
  })
}

export type PickupAddressRow = {
  id: string
  label: string | null
  contact_name: string
  contact_phone_enc: string
  province_code: string
  district_code: string
  local_level_code: string
  ward_no: number
  area_tole_enc: string
  street_landmark_enc: string | null
  postal_code: string
  is_default: boolean
}

// A shop's live pickup addresses, the default first (ciphertext; the transformer decrypts).
export async function livePickupAddresses(shopId: string): Promise<PickupAddressRow[]> {
  return db
    .from('shop_addresses')
    .where({ shop_id: shopId, purpose: 'pickup' })
    .whereNull('archived_at')
    .orderBy('is_default', 'desc')
    .orderBy('created_at', 'asc')
}

export async function pickupAddress(
  shopId: string,
  addressId: string
): Promise<PickupAddressRow | null> {
  return db
    .from('shop_addresses')
    .where({ id: addressId, shop_id: shopId, purpose: 'pickup' })
    .first()
}
