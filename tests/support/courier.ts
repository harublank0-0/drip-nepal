import { randomBytes, randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { NCM_CAPABILITIES, NcmCourierProvider } from '#modules/logistics/providers/ncm'
import { swapCourierProvider } from '#modules/logistics/providers/registry'
import { clearAssignedBranchCache } from '#modules/logistics/actions/courier_calls'
import type {
  CourierBookingOutcome,
  CourierBranch,
  CourierParcelDetail,
  CourierProvider,
  CourierResult,
  CourierStatusReading,
} from '#modules/logistics/providers/courier_provider'
import {
  insertCodPayment,
  insertLocation,
  insertOrderLine,
  insertUser,
  next,
  orderNumber,
  shopOrderValues,
  shopValues,
  type ShopOrderRef,
} from '#tests/support/schema_rows'

/*
 * The M6 courier test world: an active shop with an active NCM account
 * (credentials really encrypted), the `vendor` mode, a pickup address with
 * encrypted contact data, two branches, and an accepted COD shop order whose
 * two units are committed in stock, with its `pending` shipment. Built with
 * rows, as the actions of M1 to M5 that would create them do not exist yet
 * (dripnepal-testing skill, "Set up state through the real actions").
 *
 * `fakeCourier()` swaps the NCM adapter for a scripted one; nothing leaves
 * the process. Its callback parser is the real NCM one (it is pure).
 */

export const OWNER_PASSWORD = 'correct horse battery staple'
export const NCM_TOKEN = 'synthetic-ncm-token-00000000000000'
export const RECIPIENT = { name: 'Synthetic Customer', phone: '9800000001', area: 'Example Tole' }

export type CourierWorld = {
  ownerId: string
  shopId: string
  slug: string
  accountId: string
  addressId: string
  originBranchId: string
  destinationBranchId: string
  orderId: string
  orderNumber: string
  shopOrder: ShopOrderRef
  shipmentId: string
  paymentId: string
  itemId: string
  variantId: string
}

const snapshotMember = (member: string, value: string) =>
  encryptField(value, `orders.shipping_address.${member}`)

export async function ensureBranches() {
  const rows = [
    {
      name: 'TINKUNE',
      external_branch_id: '101',
      code: 'TINK1',
      courier_district: 'Kathmandu',
      district_code: '306',
    },
    {
      name: 'POKHARA',
      external_branch_id: '102',
      code: 'PKR1',
      courier_district: 'Kaski',
      district_code: null,
    },
  ]
  for (const row of rows) {
    await db
      .table('logistics_branches')
      .insert({ provider_code: 'ncm', ...row })
      .onConflict(['provider_code', 'name'])
      .ignore()
  }
  const found = await db
    .from('logistics_branches')
    .where('provider_code', 'ncm')
    .whereIn('name', ['TINKUNE', 'POKHARA'])
  return {
    origin: found.find((row) => row.name === 'TINKUNE')!.id as string,
    destination: found.find((row) => row.name === 'POKHARA')!.id as string,
  }
}

export async function insertNcmAccount(shopId: string, values: Record<string, unknown> = {}) {
  const [row] = await db
    .table('logistics_accounts')
    .insert({
      provider_code: 'ncm',
      owner_type: 'shop',
      shop_id: shopId,
      name: `NCM ${next()}`,
      environment: 'sandbox',
      credentials_enc: encryptField(
        JSON.stringify({ token: NCM_TOKEN }),
        'logistics_accounts.credentials_enc'
      ),
      status: 'active',
      verified_at: db.raw('now()'),
      ...values,
    })
    .returning('id')
  await db.table('logistics_account_shops').insert({
    account_id: row.id,
    shop_id: shopId,
    account_owner_type: 'shop',
    owner_shop_id: shopId,
  })
  return row.id as string
}

export async function insertEncryptedPickupAddress(shopId: string, isDefault = true) {
  const [row] = await db
    .table('shop_addresses')
    .insert({
      shop_id: shopId,
      purpose: 'pickup',
      contact_name: 'Ram Thapa',
      contact_phone_enc: encryptField('9812345678', 'shop_addresses.contact_phone_enc'),
      province_code: '3',
      district_code: '306',
      local_level_code: '30608',
      ward_no: 10,
      area_tole_enc: encryptField('Thamel', 'shop_addresses.area_tole_enc'),
      is_default: isDefault,
    })
    .returning('id')
  return row.id as string
}

export async function activeShop(ownerId?: string) {
  await insertLocation()
  const owner = ownerId ?? (await insertUser())
  await db
    .from('users')
    .where('id', owner)
    .update({ password_hash: await hash.make(OWNER_PASSWORD) })
  // Inserted pending, then its agreement, then activated: `shops_require_agreement` (INV-18).
  const [shop] = await db.table('shops').insert(shopValues(owner)).returning(['id', 'slug'])
  await db.table('shop_agreements').insert({
    shop_id: shop.id,
    agreement_version: '2026-01-01',
    accepted_by_user_id: owner,
    ip_hash: randomBytes(32),
    request_id: randomUUID(),
  })
  await db
    .from('shops')
    .where('id', shop.id)
    .update({ status: 'active', approved_at: db.raw('now()'), approved_by: await insertUser() })
  return { ownerId: owner, shopId: shop.id as string, slug: shop.slug as string }
}

export async function courierWorld(
  options: {
    verification?: 'pending' | 'verified' | 'review_required' | 'failed'
    mode?: 'vendor' | 'manual'
  } = {}
): Promise<CourierWorld> {
  const { ownerId, shopId, slug } = await activeShop()
  const accountId = await insertNcmAccount(shopId)
  if ((options.mode ?? 'vendor') === 'vendor') {
    await db.table('shop_logistics_settings').insert({
      shop_id: shopId,
      fulfillment_mode: 'vendor',
      default_account_id: accountId,
      default_account_owner_type: 'shop',
    })
  }
  const addressId = await insertEncryptedPickupAddress(shopId)
  const branches = await ensureBranches()

  const verification = options.verification ?? 'verified'
  const customerId = await insertUser()
  const [order] = await db
    .table('orders')
    .insert({
      number: orderNumber(),
      customer_user_id: customerId,
      status: 'placed',
      payment_method: 'cod',
      items_subtotal_minor: 100000,
      shipping_total_minor: 10000,
      grand_total_minor: 110000,
      shipping_address: JSON.stringify({
        schema: 1,
        recipient_name_enc: snapshotMember('recipient_name_enc', RECIPIENT.name),
        recipient_phone_enc: snapshotMember('recipient_phone_enc', RECIPIENT.phone),
        recipient_phone_last4: RECIPIENT.phone.slice(-4),
        province_code: '3',
        district_code: '306',
        district_name_en: 'Kathmandu',
        local_level_code: '30608',
        local_level_name_en: 'Kathmandu Metropolitan City',
        ward_no: 10,
        area_tole_enc: snapshotMember('area_tole_enc', RECIPIENT.area),
      }),
      shipping_district_code: '306',
      customer_email_snapshot: 'buyer@example.com',
      verification_status: verification,
      verification_method: verification === 'pending' ? null : 'phone_call',
      verified_at: verification === 'verified' ? db.raw('now()') : null,
    })
    .returning(['id', 'number'])
  const number = `${order.number}-1`
  const [row] = await db
    .table('shop_orders')
    .insert(
      shopOrderValues(order.id, shopId, number, {
        status: 'accepted',
        accepted_at: db.raw('now()'),
      })
    )
    .returning('id')
  const shopOrder: ShopOrderRef = {
    id: row.id,
    orderId: order.id,
    shopId,
    number,
    customerUserId: customerId,
  }
  const line = await insertOrderLine(shopOrder)
  await db
    .table('inventory_items')
    .insert({ variant_id: line.variantId, shop_id: shopId, on_hand: 5, reserved: 2 })
  await db.table('inventory_reservations').insert({
    order_id: order.id,
    order_item_id: line.id,
    shop_id: shopId,
    variant_id: line.variantId,
    quantity: 2,
    status: 'committed',
  })
  const paymentId = await insertCodPayment(shopOrder, false)
  const [shipment] = await db
    .table('shipments')
    .insert({ shop_order_id: shopOrder.id, shop_id: shopId })
    .returning('id')
  return {
    ownerId,
    shopId,
    slug,
    accountId,
    addressId,
    originBranchId: branches.origin,
    destinationBranchId: branches.destination,
    orderId: order.id,
    orderNumber: order.number,
    shopOrder,
    shipmentId: shipment.id,
    paymentId,
    itemId: line.id,
    variantId: line.variantId,
  }
}

export type FakeCourier = ReturnType<typeof fakeCourier>

const notFound = <T>(): CourierResult<T> => ({
  ok: false,
  error: { code: 'not_found', httpStatus: 404, fields: [], retryable: false },
})

// A scripted NCM: each list is consumed in order; an empty list answers the default.
export function fakeCourier() {
  const real = new NcmCourierProvider({ baseUrls: { sandbox: null, production: null } })
  const calls: { method: string; accountId: string; token: string | null; args: unknown }[] = []
  const script = {
    book: [] as (CourierBookingOutcome | (() => Promise<CourierBookingOutcome>))[],
    history: new Map<string, CourierStatusReading[]>(),
    historyFails: 0,
    detail: new Map<string, CourierParcelDetail>(),
    detailFails: 0,
    // Awaited before each detail read: a race test holds the jobs here to start their replays together.
    beforeDetail: null as (() => Promise<void>) | null,
    statuses: new Map<string, string>(),
    branches: [] as CourierBranch[],
    branchesResult: null as CourierResult<CourierBranch[]> | null,
    assigned: ['TINKUNE'] as string[] | null,
    assignedError: null as 'auth_failed' | 'timeout' | null,
  }
  let nextId = 7000
  const record = async (
    method: string,
    account: { id: string; credentials: () => Promise<{ token: string }> },
    args: unknown
  ) => {
    let token: string | null = null
    try {
      const credentials = await account.credentials()
      token = credentials.token
    } catch {
      token = null
    }
    calls.push({ method, accountId: account.id, token, args })
  }
  const provider: CourierProvider = {
    code: 'ncm',
    capabilities: NCM_CAPABILITIES,
    async book(account, request) {
      await record('book', account, request)
      const step = script.book.shift()
      if (!step) return { outcome: 'succeeded', externalShipmentId: String(nextId++) }
      return typeof step === 'function' ? step() : step
    },
    async getParcel(account, id) {
      await record('getParcel', account, id)
      if (script.beforeDetail) await script.beforeDetail()
      if (script.detailFails > 0) {
        script.detailFails--
        return {
          ok: false,
          error: { code: 'timeout', httpStatus: null, fields: [], retryable: false },
        }
      }
      const detail = script.detail.get(id)
      return detail ? { ok: true, value: detail } : notFound()
    },
    async getStatusHistory(account, id) {
      await record('getStatusHistory', account, id)
      if (script.historyFails > 0) {
        script.historyFails--
        return {
          ok: false,
          error: { code: 'timeout', httpStatus: null, fields: [], retryable: false },
        }
      }
      return { ok: true, value: script.history.get(id) ?? [] }
    },
    async getStatuses(account, ids) {
      await record('getStatuses', account, ids)
      const statuses = new Map<string, string>()
      const unanswered: string[] = []
      for (const id of ids) {
        const status = script.statuses.get(id)
        if (status) statuses.set(id, status)
        else unanswered.push(id)
      }
      return { ok: true, value: { statuses, unanswered } }
    },
    async listBranches(account) {
      await record('listBranches', account, null)
      return script.branchesResult ?? { ok: true, value: script.branches }
    },
    async listAssignedBranches(account) {
      await record('listAssignedBranches', account, null)
      if (script.assignedError) {
        return {
          ok: false,
          error: { code: script.assignedError, httpStatus: 401, fields: [], retryable: false },
        }
      }
      return script.assigned ? { ok: true, value: script.assigned } : notFound()
    },
    parseCallback: (raw) => real.parseCallback(raw),
  }
  const restore = swapCourierProvider('ncm', provider)
  clearAssignedBranchCache()
  return { provider, calls, script, restore }
}

// A courier status reading at `minutesAgo` minutes before now.
export function reading(id: string, rawStatus: string, minutesAgo: number): CourierStatusReading {
  return {
    externalShipmentId: id,
    rawEvent: null,
    rawStatus,
    occurredAt: new Date(Date.now() - minutesAgo * 60_000),
  }
}

export const NO_RETURN: Omit<CourierParcelDetail, 'externalShipmentId'> = {
  codAmountMinor: 110000,
  deliveryChargeMinor: 15000,
  lastStatus: 'Delivered',
  paymentStatus: 'Pending',
  returnedToVendor: false,
}
