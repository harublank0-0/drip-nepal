import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import LogisticsAccount from '#models/logistics_account'
import LogisticsBranch from '#models/logistics_branch'
import { courierProvider } from '#modules/logistics/providers/registry'
import type { CourierCapabilities } from '#modules/logistics/domain/courier_capability'

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
export function courierCapabilities(providerCode: string): CourierCapabilities | null {
  return courierProvider(providerCode)?.capabilities ?? null
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

export async function listAccounts(filters: {
  ownerType?: string
  status?: string
  limit: number
  after?: string
}) {
  const query = LogisticsAccount.query()
    .orderBy('id', 'asc')
    .limit(filters.limit + 1)
  if (filters.ownerType) query.where('owner_type', filters.ownerType)
  if (filters.status) query.where('status', filters.status)
  if (filters.after) query.where('id', '>', filters.after)
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
    next: rows.length > filters.limit ? rows[filters.limit - 1].id : null,
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
  const settings = await trx
    .from('shop_logistics_settings')
    .where('shop_id', shopId)
    .forShare()
    .first()
  const link = await trx
    .from('logistics_account_shops')
    .where({ account_id: accountId, shop_id: shopId })
    .forShare()
    .first()
  const row = await trx.from('logistics_accounts').where('id', accountId).forShare().first()
  const provider = row
    ? await trx.from('logistics_providers').where('code', row.provider_code).first()
    : null
  return {
    fulfillmentMode: (settings?.fulfillment_mode as string | undefined) ?? 'manual',
    isEnabled: (settings?.is_enabled as boolean | undefined) ?? true,
    linkActive: Boolean(link?.is_active),
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
  after?: string
}) {
  const query = LogisticsBranch.query()
    .where('provider_code', filters.providerCode)
    .orderBy('name', 'asc')
    .orderBy('id', 'asc')
    .limit(filters.limit + 1)
  if (filters.isActive !== undefined) query.where('is_active', filters.isActive)
  if (filters.unmapped) query.whereNull('district_code')
  if (filters.after) {
    const cursor = await LogisticsBranch.find(filters.after)
    if (cursor) {
      query.where((q) =>
        q
          .where('name', '>', cursor.name)
          .orWhere((r) => r.where('name', cursor.name).where('id', '>', cursor.id))
      )
    }
  }
  const rows = await query
  return {
    branches: rows.slice(0, filters.limit).map(branchView),
    next: rows.length > filters.limit ? rows[filters.limit - 1].id : null,
  }
}

// Active branches of a courier, for the booking form's choices.
export async function activeBranches(providerCode: string) {
  const rows = await LogisticsBranch.query()
    .where({ provider_code: providerCode, is_active: true })
    .orderBy('name', 'asc')
  return rows.map(branchView)
}
