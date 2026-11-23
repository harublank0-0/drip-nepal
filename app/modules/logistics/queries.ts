import db from '@adonisjs/lucid/services/db'
import type { QueryClientContract, TransactionClientContract } from '@adonisjs/lucid/types/database'
import LogisticsAccount from '#models/logistics_account'
import LogisticsBranch from '#models/logistics_branch'
import { courierProviderCodes as registryProviderCodes } from '#modules/logistics/providers/registry'
import { LOGISTICS_ACCOUNT_OWNER_TYPES } from '#modules/logistics/domain/logistics_account_owner_type'
import { LOGISTICS_ACCOUNT_STATUSES } from '#modules/logistics/domain/logistics_account_status'
import { COURIER_EVENT_PROCESSING_STATUSES } from '#modules/logistics/domain/courier_event_processing_status'

/*
 * Reads of the `logistics` tables for the modules above it and the HTTP layer
 * (docs/09 §3.9). Every shop-scoped read takes the resolved shop ID (docs/07
 * §4.1): an account of another shop is simply not found.
 */

export type AccountView = {
  id: string
  providerCode: string
  ownerType: string
  shopId: string | null
  name: string
  environment: string
  externalAccountRef: string | null
  status: string
  verifiedAt: Date | null
  disabledAt: Date | null
  version: number
  createdAt: Date
}

function view(row: LogisticsAccount): AccountView {
  return {
    id: row.id,
    providerCode: row.providerCode,
    ownerType: row.ownerType,
    shopId: row.shopId,
    name: row.name,
    environment: row.environment,
    externalAccountRef: row.externalAccountRef,
    status: row.status,
    verifiedAt: row.verifiedAt?.toJSDate() ?? null,
    disabledAt: row.disabledAt?.toJSDate() ?? null,
    version: row.version,
    createdAt: row.createdAt.toJSDate(),
  }
}

// The capabilities a courier's adapter declares (C-03: the adapter is the runtime source).
// The provider codes that have an adapter (the admin branch list's `provider_code` filter).
export function courierProviderCodes() {
  return registryProviderCodes()
}

export async function shopAccount(shopId: string, accountId: string) {
  const row = await LogisticsAccount.query().where('id', accountId).where('shop_id', shopId).first()
  return row ? view(row) : null
}

// The accounts a shop may book through: its active rows of docs/04a §9.10.
export async function accountsUsableByShop(shopId: string) {
  const rows = await LogisticsAccount.query()
    .whereIn(
      'id',
      db
        .from('logistics_account_shops')
        .where({ shop_id: shopId, is_active: true })
        .select('account_id')
    )
    .orderBy('created_at', 'asc')
  return rows.map(view)
}

export async function account(accountId: string) {
  const row = await LogisticsAccount.find(accountId)
  return row ? view(row) : null
}

// The values the admin list filters accept (docs/06 §6.3), for the HTTP layer.
export const LIST_FILTER_VALUES = {
  ownerTypes: LOGISTICS_ACCOUNT_OWNER_TYPES,
  accountStatuses: LOGISTICS_ACCOUNT_STATUSES,
  processingStatuses: COURIER_EVENT_PROCESSING_STATUSES,
} as const

// A keyset position of a cursor list (docs/06 §6.2): the last row's sort value and ID.
export type Seek = { key: string; id: string }

// adminListLogisticsAccounts: oldest first (`created_at`, `id`).
export async function listAccounts(filters: {
  ownerType?: string
  status?: string
  limit: number
  seek: Seek | null
}) {
  const query = LogisticsAccount.query()
    .select('*')
    // RFC 3339 text with microseconds, so a seek never repeats a row.
    .select(
      db.raw(`to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as sort_key`)
    )
    .orderBy('created_at', 'asc')
    .orderBy('id', 'asc')
    .limit(filters.limit + 1)
  if (filters.ownerType) query.where('owner_type', filters.ownerType)
  if (filters.status) query.where('status', filters.status)
  if (filters.seek) {
    query.whereRaw('(created_at, id) > (?::timestamptz, ?::uuid)', [
      filters.seek.key,
      filters.seek.id,
    ])
  }
  const rows = await query
  const allowed = await db
    .from('logistics_account_shops')
    .whereIn(
      'account_id',
      rows.map((row) => row.id)
    )
    .select('account_id', 'shop_id', 'is_active')
  return {
    accounts: rows.slice(0, filters.limit).map((row) => ({
      ...view(row),
      shops: allowed
        .filter((link) => link.account_id === row.id)
        .map((link) => ({ shopId: link.shop_id as string, isActive: link.is_active as boolean })),
    })),
    last:
      rows.length > filters.limit
        ? {
            key: rows[filters.limit - 1].$extras.sort_key as string,
            id: rows[filters.limit - 1].id,
          }
        : null,
  }
}

export type SettingsView = {
  shopId: string
  fulfillmentMode: string
  defaultAccountId: string | null
  isEnabled: boolean
  version: number
}

// A shop with no row is `manual`, enabled, version 0 (docs/04a §9.11).
export async function logisticsSettings(shopId: string): Promise<SettingsView> {
  const row = await db.from('shop_logistics_settings').where('shop_id', shopId).first()
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

/*
 * What the booking action checks in its transaction (INV-29, docs/04 §16.2):
 * the shop's settings, the account's row for the shop and the account, read
 * `FOR SHARE`, so a concurrent disable or suspension waits for the booking.
 */
export async function bookingTerms(
  trx: TransactionClientContract,
  shopId: string,
  accountId: string
) {
  // Lock order of the courier tables: the account, its shop row, then the settings (as
  // disabling an account takes them).
  const row = await trx.from('logistics_accounts').where('id', accountId).forShare().first()
  const link = await trx
    .from('logistics_account_shops')
    .where({ account_id: accountId, shop_id: shopId })
    .forShare()
    .first()
  // Before the settings, as disabling the shop's own account takes it, its rows, then the settings.
  const ownAccountActive = await shopHasActiveOwnAccount(trx, shopId)
  const settings = await trx
    .from('shop_logistics_settings')
    .where('shop_id', shopId)
    .forShare()
    .first()
  const provider = row
    ? await trx.from('logistics_providers').where('code', row.provider_code).first()
    : null
  return {
    fulfillmentMode: (settings?.fulfillment_mode as string | undefined) ?? 'manual',
    isEnabled: (settings?.is_enabled as boolean | undefined) ?? true,
    linkActive: Boolean(link?.is_active),
    ownAccountActive,
    account: row
      ? {
          id: row.id as string,
          ownerType: row.owner_type as string,
          status: row.status as string,
          environment: row.environment as string,
          providerCode: row.provider_code as string,
          providerName: (provider?.name as string | undefined) ?? null,
          providerActive: Boolean(provider?.is_active),
        }
      : null,
  }
}

/*
 * Whether the shop has an `active` courier account of its own. A shop that
 * has one books on it: the platform-owned accounts are for shops without one
 * (OD-58, re-decided 2026-11-22; `own_account_active`). The active accounts
 * found are read `FOR SHARE`, so disabling or suspending one waits for the
 * caller. An account that becomes active meanwhile is not locked: that is the
 * caller committing first, and a later booking refuses the platform account
 * (docs/04a §9.11).
 */
export async function shopHasActiveOwnAccount(trx: TransactionClientContract, shopId: string) {
  const own = await trx
    .from('logistics_accounts')
    .where({ owner_type: 'shop', shop_id: shopId, status: 'active' })
    .forShare()
    .select('id')
  return own.length > 0
}

export type BranchView = {
  id: string
  providerCode: string
  name: string
  externalBranchId: string | null
  code: string | null
  courierDistrict: string | null
  districtCode: string | null
  coveredAreas: string | null
  phone: string | null
  isActive: boolean
  syncedAt: Date
}

function branchView(row: LogisticsBranch): BranchView {
  return {
    id: row.id,
    providerCode: row.providerCode,
    name: row.name,
    externalBranchId: row.externalBranchId,
    code: row.code,
    courierDistrict: row.courierDistrict,
    districtCode: row.districtCode,
    coveredAreas: row.coveredAreas,
    phone: row.phone,
    isActive: row.isActive,
    syncedAt: row.syncedAt.toJSDate(),
  }
}

export async function branch(branchId: string) {
  const row = await LogisticsBranch.find(branchId)
  return row ? branchView(row) : null
}

export async function listBranches(filters: {
  providerCode: string
  isActive?: boolean
  unmapped?: boolean
  limit: number
  seek: Seek | null
}) {
  const query = LogisticsBranch.query()
    .where('provider_code', filters.providerCode)
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(filters.limit + 1)
  if (filters.isActive !== undefined) query.where('is_active', filters.isActive)
  if (filters.unmapped) query.whereNull('district_code')
  if (filters.seek) {
    query.whereRaw('(name, id) > (?, ?::uuid)', [filters.seek.key, filters.seek.id])
  }
  const rows = await query
  return {
    branches: rows.slice(0, filters.limit).map(branchView),
    last:
      rows.length > filters.limit
        ? { key: rows[filters.limit - 1].name, id: rows[filters.limit - 1].id }
        : null,
  }
}

// Active branches of a courier, for the booking form's choices.
export async function activeBranches(providerCode: string) {
  const rows = await LogisticsBranch.query()
    .where({ provider_code: providerCode, is_active: true })
    .orderBy('name', 'asc')
  return rows.map(branchView)
}

/*
 * The national location reference data (docs/04a §9.1–§9.3; 04 §21.4,
 * VX-10) for the address cascades of docs/06 §13.2 (`listProvinces`,
 * `listDistricts`, `listLocalLevels`) and the address checks of the modules
 * above. Only active rows are offered: a unit the government merges or
 * renames keeps its row with `is_active = false`, and addresses already
 * saved with it stay valid (04a §9). Names are the English ones, the UI's
 * language; districts and local levels are ordered by name, provinces by
 * code, the order of 04 §21.4. `client` reads inside the caller's
 * transaction (docs/09 §3.9).
 */
export type Place = { code: string; name: string }
export type LocalLevelPlace = Place & { wardCount: number }

export async function activeProvinces(): Promise<Place[]> {
  const rows = await db
    .from('provinces')
    .where('is_active', true)
    .orderBy('code', 'asc')
    .select('code', 'name_en')
  return rows.map((row) => ({ code: row.code, name: row.name_en }))
}

// The active districts of an active province; empty for an unknown or inactive one.
export async function activeDistricts(provinceCode: string): Promise<Place[]> {
  const rows = await db
    .from('districts as d')
    .join('provinces as p', 'p.code', 'd.province_code')
    .where('d.province_code', provinceCode)
    .where('d.is_active', true)
    .where('p.is_active', true)
    .orderBy('d.name_en', 'asc')
    .orderBy('d.code', 'asc')
    .select('d.code', 'd.name_en')
  return rows.map((row) => ({ code: row.code, name: row.name_en }))
}

// The active local levels of an active district, with their ward counts; empty otherwise.
export async function activeLocalLevels(districtCode: string): Promise<LocalLevelPlace[]> {
  const rows = await db
    .from('local_levels as l')
    .join('districts as d', 'd.code', 'l.district_code')
    .join('provinces as p', 'p.code', 'd.province_code')
    .where('l.district_code', districtCode)
    .where('l.is_active', true)
    .where('d.is_active', true)
    .where('p.is_active', true)
    .orderBy('l.name_en', 'asc')
    .orderBy('l.code', 'asc')
    .select('l.code', 'l.name_en', 'l.ward_count')
  return rows.map((row) => ({ code: row.code, name: row.name_en, wardCount: row.ward_count }))
}

/*
 * An active local level with its district and province, all three active,
 * for an address check (docs/04a §5.5: the validator checks the hierarchy
 * before the insert, so the composite keys are only a backstop); null for
 * an unknown or inactive one.
 */
export type LocalLevelChain = {
  code: string
  districtCode: string
  provinceCode: string
  wardCount: number
}

export async function activeLocalLevelChain(
  code: string,
  options: { client?: QueryClientContract } = {}
): Promise<LocalLevelChain | null> {
  const client: QueryClientContract = options.client ?? db.connection()
  const row = await client
    .from('local_levels as l')
    .join('districts as d', 'd.code', 'l.district_code')
    .join('provinces as p', 'p.code', 'd.province_code')
    .where('l.code', code)
    .where('l.is_active', true)
    .where('d.is_active', true)
    .where('p.is_active', true)
    .select('l.code', 'l.district_code', 'd.province_code', 'l.ward_count')
    .first()
  if (!row) return null
  return {
    code: row.code,
    districtCode: row.district_code,
    provinceCode: row.province_code,
    wardCount: row.ward_count,
  }
}

/*
 * The names of saved local levels with their district and province, active
 * or not, so an address saved before a unit was renamed still shows its
 * place (docs/04a §9 "Changes"). Keyed by local-level code.
 */
export type PlaceNames = { localLevel: string; district: string; province: string }

export async function placeNames(localLevelCodes: string[]): Promise<Map<string, PlaceNames>> {
  const codes = [...new Set(localLevelCodes)]
  if (codes.length === 0) return new Map()
  const rows = await db
    .from('local_levels as l')
    .join('districts as d', 'd.code', 'l.district_code')
    .join('provinces as p', 'p.code', 'd.province_code')
    .whereIn('l.code', codes)
    .select('l.code', 'l.name_en as local_level', 'd.name_en as district', 'p.name_en as province')
  return new Map(
    rows.map((row) => [
      row.code as string,
      { localLevel: row.local_level, district: row.district, province: row.province },
    ])
  )
}

/*
 * A shop's delivery configuration (docs/04a §9.6, §9.7; 01 FR-SHOP-004;
 * R1-S part 1c): the districts it delivers to, by code, and its rate for
 * each zone, the zones in their editor order (`delivery_zones.position`).
 * `configured` is the publish gate's "shipping is configured" condition
 * (AC-FR-CAT-005-2, AC-FR-SHOP-004-3) on these rows: at least one covered
 * district, and every covered district's zone with a rate, the same test as
 * `shippingConfigured`. `client` reads inside the caller's transaction.
 */
export type ShopRate = {
  zoneCode: string
  feeMinor: number
  estMinDays: number
  estMaxDays: number
}

export type ShopShippingView = { coverage: string[]; rates: ShopRate[]; configured: boolean }

export async function shopShipping(
  shopId: string,
  options: { client?: QueryClientContract } = {}
): Promise<ShopShippingView> {
  const client: QueryClientContract = options.client ?? db.connection()
  const covered: { district_code: string; zone_code: string | null }[] = await client
    .from('shop_delivery_coverage as c')
    .leftJoin('delivery_zone_districts as dz', 'dz.district_code', 'c.district_code')
    .where('c.shop_id', shopId)
    .orderBy('c.district_code', 'asc')
    .select('c.district_code', 'dz.zone_code')
  const rates: {
    zone_code: string
    fee_minor: number
    est_min_days: number
    est_max_days: number
  }[] = await client
    .from('shop_shipping_rates as r')
    .join('delivery_zones as z', 'z.code', 'r.zone_code')
    .where('r.shop_id', shopId)
    .orderBy('z.position', 'asc')
    .orderBy('z.code', 'asc')
    .select('r.zone_code', 'r.fee_minor', 'r.est_min_days', 'r.est_max_days')
  const rated = new Set(rates.map((rate) => rate.zone_code))
  return {
    coverage: covered.map((row) => row.district_code),
    rates: rates.map((rate) => ({
      zoneCode: rate.zone_code,
      feeMinor: rate.fee_minor,
      estMinDays: rate.est_min_days,
      estMaxDays: rate.est_max_days,
    })),
    configured:
      covered.length > 0 &&
      covered.every((row) => row.zone_code !== null && rated.has(row.zone_code)),
  }
}

/*
 * Whether a shop's shipping is configured (AC-FR-CAT-005-2,
 * AC-FR-SHOP-004-3): at least one covered district, and no covered district
 * whose zone has no rate for the shop. The overview's "before you can sell"
 * item reads it (docs/08 §2.5), and the publish gate of R1-S part 2 will.
 * One round trip on the two primary keys and
 * `delivery_zone_districts_district_key`.
 */
export async function shippingConfigured(
  shopId: string,
  options: { client?: QueryClientContract } = {}
): Promise<boolean> {
  const client: QueryClientContract = options.client ?? db.connection()
  const result = await client.rawQuery(
    `SELECT EXISTS (SELECT 1 FROM shop_delivery_coverage WHERE shop_id = :shop)
            AND NOT EXISTS (
              SELECT 1
                FROM shop_delivery_coverage c
                LEFT JOIN delivery_zone_districts dz ON dz.district_code = c.district_code
                LEFT JOIN shop_shipping_rates r
                       ON r.shop_id = c.shop_id AND r.zone_code = dz.zone_code
               WHERE c.shop_id = :shop AND r.zone_code IS NULL) AS configured`,
    { shop: shopId }
  )
  return result.rows[0]?.configured === true
}

/*
 * The delivery areas a shop chooses from in its shipping editor (docs/04a
 * §9.4, §9.5; docs/08 §2.5 `/shipping`): the active zones in their editor
 * order, and the active provinces by code with their active districts by
 * name, each district with its zone. A district without an active zone is
 * left out: no rate could price it (T-SHOP-108 keeps every active district
 * in one zone). Public reference data, the same for every shop. The names
 * are the English ones, the UI's language, offered as choices and never
 * described as official (VX-10).
 */
export type DeliveryZoneView = { code: string; name: string }
export type DeliveryDistrictView = Place & { zoneCode: string }
export type DeliveryProvinceView = Place & { districts: DeliveryDistrictView[] }
export type DeliveryAreas = { zones: DeliveryZoneView[]; provinces: DeliveryProvinceView[] }

export async function deliveryAreas(
  options: { client?: QueryClientContract } = {}
): Promise<DeliveryAreas> {
  const client: QueryClientContract = options.client ?? db.connection()
  const zones: { code: string; name_en: string }[] = await client
    .from('delivery_zones')
    .where('is_active', true)
    .orderBy('position', 'asc')
    .orderBy('code', 'asc')
    .select('code', 'name_en')
  const rows: {
    code: string
    name_en: string
    province_code: string
    province_name: string
    zone_code: string
  }[] = await client
    .from('districts as d')
    .join('provinces as p', 'p.code', 'd.province_code')
    .join('delivery_zone_districts as dz', 'dz.district_code', 'd.code')
    .join('delivery_zones as z', 'z.code', 'dz.zone_code')
    .where('d.is_active', true)
    .where('p.is_active', true)
    .where('z.is_active', true)
    .orderBy('p.code', 'asc')
    .orderBy('d.name_en', 'asc')
    .orderBy('d.code', 'asc')
    .select('d.code', 'd.name_en', 'd.province_code', 'p.name_en as province_name', 'dz.zone_code')
  const provinces: DeliveryProvinceView[] = []
  for (const row of rows) {
    let province = provinces.at(-1)
    if (province?.code !== row.province_code) {
      province = { code: row.province_code, name: row.province_name, districts: [] }
      provinces.push(province)
    }
    province.districts.push({ code: row.code, name: row.name_en, zoneCode: row.zone_code })
  }
  return { zones: zones.map((zone) => ({ code: zone.code, name: zone.name_en })), provinces }
}
