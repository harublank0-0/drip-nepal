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
