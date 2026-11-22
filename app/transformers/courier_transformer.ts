import type { AccountView, BranchView, SettingsView } from '#modules/logistics/queries'
import type { AccountShopView } from '#modules/logistics/actions/courier_accounts'
import type { ShipmentView } from '#modules/orders/queries'
import type { ShopLabel } from '#modules/shops/queries'

/*
 * The JSON of the M6 courier resources (docs/06 §13.8; snake_case, money as
 * `{ amount_minor, currency }`). An account never carries its credentials or
 * their ciphertext (TM-32, T-SEC-040); the hyphenless reference NCM was sent
 * (`courier_reference`, OD-61) is shown so staff can search the courier's
 * portal after an unknown booking.
 */

const iso = (value: Date | string | null) => (value === null ? null : new Date(value).toISOString())

export function accountJson(account: AccountView) {
  return {
    id: account.id,
    provider_code: account.providerCode,
    owner_type: account.ownerType,
    name: account.name,
    environment: account.environment,
    external_account_ref: account.externalAccountRef,
    status: account.status,
    verified_at: iso(account.verifiedAt),
    disabled_at: iso(account.disabledAt),
    version: account.version,
  }
}

/*
 * An account on the admin courier accounts page (docs/08 §3.1 "Courier
 * operations"): the account, its owning shop and the shops on it, each with
 * its slug and name so staff can read them. Never credentials (T-SEC-040).
 */
export function adminAccountJson(
  account: AccountView & { shops: { shopId: string; isActive: boolean }[] },
  labels: Map<string, ShopLabel>
) {
  const label = (shopId: string) => {
    const shop = labels.get(shopId)
    return { shop_id: shopId, slug: shop?.slug ?? null, name: shop?.name ?? null }
  }
  return {
    ...accountJson(account),
    shop: account.shopId === null ? null : label(account.shopId),
    shops: account.shops.map((link) => ({ ...label(link.shopId), is_active: link.isActive })),
  }
}

// A shop's row on a platform-owned courier account (docs/04a §9.10; adminAllowShopOnLogisticsAccount).
export function accountShopJson(link: AccountShopView) {
  return {
    account_id: link.accountId,
    shop_id: link.shopId,
    is_active: link.isActive,
    created_at: iso(link.createdAt),
    disabled_at: iso(link.disabledAt),
  }
}

export function settingsJson(settings: SettingsView) {
  return {
    fulfillment_mode: settings.fulfillmentMode,
    default_account_id: settings.defaultAccountId,
    is_enabled: settings.isEnabled,
    version: settings.version,
  }
}

export function shipmentJson(shipment: ShipmentView) {
  return {
    id: shipment.id,
    shop_order_number: shipment.shopOrderNumber,
    status: shipment.status,
    logistics_account_id: shipment.logisticsAccountId,
    pickup_address_id: shipment.pickupAddressId,
    merchant_reference: shipment.merchantReference,
    courier_reference: shipment.merchantReference?.replaceAll('-', '') ?? null,
    external_shipment_id: shipment.externalShipmentId,
    service_code: shipment.serviceCode,
    origin_branch_id: shipment.originBranchId,
    destination_branch_id: shipment.destinationBranchId,
    cancel_requested_at: iso(shipment.cancelRequestedAt),
    cancel_requested_by: shipment.cancelRequestedBy,
    cod_amount:
      shipment.codAmountMinor === null
        ? null
        : { amount_minor: shipment.codAmountMinor, currency: 'NPR' },
    courier_name: shipment.courierName,
    tracking_number: shipment.trackingNumber,
    tracking_url: shipment.trackingUrl,
    booked_at: iso(shipment.bookedAt),
    shipped_at: iso(shipment.shippedAt),
    delivered_at: iso(shipment.deliveredAt),
    cancelled_at: iso(shipment.cancelledAt),
    return_window_ends_at: iso(shipment.returnWindowEndsAt),
    attempt_count: shipment.attemptCount,
    version: shipment.version,
  }
}

export function branchJson(branch: BranchView) {
  return {
    id: branch.id,
    provider_code: branch.providerCode,
    name: branch.name,
    external_branch_id: branch.externalBranchId,
    code: branch.code,
    courier_district: branch.courierDistrict,
    district_code: branch.districtCode,
    covered_areas: branch.coveredAreas,
    phone: branch.phone,
    is_active: branch.isActive,
    synced_at: iso(branch.syncedAt),
  }
}

// A courier inbox row; its payload is already redacted to the courier's status fields.
export function courierEventJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    logistics_account_id: row.logistics_account_id,
    source: row.source,
    external_shipment_id: row.external_shipment_id,
    shipment_id: row.shipment_id,
    raw_event: row.raw_event,
    raw_status: row.raw_status,
    mapped_status: row.mapped_status,
    occurred_at: iso((row.occurred_at as Date | null) ?? null),
    payload: row.payload,
    received_at: iso(row.received_at as Date),
    processed_at: iso((row.processed_at as Date | null) ?? null),
    processing_status: row.processing_status,
    hold_reason: row.hold_reason,
  }
}

export function attemptJson(row: Record<string, unknown>) {
  return {
    id: row.id,
    kind: row.kind,
    attempt_no: row.attempt_no,
    outcome: row.outcome,
    http_status: row.http_status,
    error_code: row.error_code,
    error_fields: typeof row.error_fields === 'string' ? row.error_fields.split(',') : [],
    external_shipment_id: row.external_shipment_id,
    started_at: iso(row.started_at as Date),
    finished_at: iso((row.finished_at as Date | null) ?? null),
  }
}
