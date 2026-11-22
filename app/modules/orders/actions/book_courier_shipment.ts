import app from '@adonisjs/core/services/app'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, InvalidStateTransition } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { courierCapabilitiesOf, courierServices } from '#modules/logistics/actions/courier_calls'
import { bookingTerms } from '#modules/logistics/queries'
import type { Actor } from '#modules/platform/actor'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'
import { sendJob } from '#modules/platform/jobs'
import { settingIn } from '#modules/platform/settings'
import { assertTransition } from '#modules/platform/state_machine'
import { COURIER_SHIPMENT } from '#modules/orders/domain/shipment_machine'
import type { ShipmentStatus } from '#modules/orders/domain/shipment_status'
import { shipmentById, type ShipmentView } from '#modules/orders/queries'

/*
 * `bookCourierShipment` (docs/06 §13.8, docs/05 §6.3; M6, OD-56): the vendor
 * books the parcel with a courier, `pending` or `packed` → `booking_requested`,
 * in one request transaction behind its idempotency key. Locks follow docs/05
 * §4.4: the parent order (3, which also carries the OD-57 verification),
 * the shop order (4), the shipment (5), the COD payment (6). The account, its
 * row for the shop and the settings are read `FOR SHARE` (INV-29), the pickup
 * address `FOR KEY SHARE`, so a concurrent disable, suspension or archive
 * waits for the booking or makes it fail.
 *
 * What the booking uses is fixed here and never changes (INV-30): the
 * account, the pickup address, the reference `<shop order number>-S<n>`, the
 * service, the branches and the COD amount (the COD payment's
 * `amount_minor`, 04 §16.4). The rows of `shipment_items` list every kept
 * unit; the reservations stay `committed` until the courier picks the parcel
 * up. No courier call happens here: the job `orders.book_courier_shipment`,
 * sent in this transaction, makes it (docs/03 §11.4).
 *
 * The shop's mode names the account's owner type: `vendor` its own account,
 * `platform` a platform-owned one it is allowed on (OD-58, re-decided
 * 2026-11-22). A shop with an active account of its own is refused a
 * platform-owned one (`own_account_active`), and a COD shipment on a
 * platform-owned account waits for `platform_account_cod_enabled` (docs/04a
 * §15.1): NCM would remit that cash to DripNepal, which REG-27 does not allow
 * until counsel clears it.
 */

export type BookCommand = {
  shopId: string
  shopOrderNumber: string
  accountId: string
  pickupAddressId: string
  serviceCode: string
  originBranchId: string | null
  destinationBranchId: string | null
}

const VERIFICATION_HOLDS = new Set(['review_required', 'failed'])
const OWNER_TYPE_OF_MODE: Record<string, string> = { vendor: 'shop', platform: 'platform' }

function invalid(field: string, code: string, message: string) {
  return new DomainError('VALIDATION_FAILED', { errors: [{ field, code, message }] })
}

function conflict(current: string, detail: string) {
  return new DomainError('INVALID_STATE_TRANSITION', {
    detail,
    extensions: { current_status: current, allowed_events: [] },
  })
}

// The parent order, shop order and live shipment, locked in docs/05 §4.4 order.
export async function lockShipmentChain(
  trx: TransactionClientContract,
  shopOrderNumber: string,
  shopId?: string
) {
  const lookup = trx
    .from('shop_orders')
    .where('number', shopOrderNumber)
    .whereNotNull('acceptance_due_at')
  if (shopId) lookup.where('shop_id', shopId)
  const found = await lookup.select('id', 'order_id').first()
  if (!found) throw new DomainError('NOT_FOUND')
  const order = await trx.from('orders').where('id', found.order_id).forUpdate().first()
  const shopOrder = await trx.from('shop_orders').where('id', found.id).forUpdate().first()
  const shipment = await trx
    .from('shipments')
    .where('shop_order_id', found.id)
    .whereNot('status', 'cancelled')
    .forUpdate()
    .first()
  return { order, shopOrder, shipment }
}

// docs/05 §6.3 "Dispatch rule" (OD-57, T-ORD-011).
export function assertDispatchAllowed(order: { verification_status: string }, current: string) {
  if (VERIFICATION_HOLDS.has(order.verification_status)) {
    throw conflict(
      current,
      'This order is waiting for the platform to verify it. It can be packed but not shipped yet.'
    )
  }
}

export async function bookCourierShipment<T>(
  command: BookCommand,
  context: {
    actor: Actor
    idempotency: IdempotencyScope | null
    present: (shipment: ShipmentView) => T
  }
) {
  return idempotentTx(context.idempotency, async (trx) => {
    const { order, shopOrder, shipment } = await lockShipmentChain(
      trx,
      command.shopOrderNumber,
      command.shopId
    )
    if (!shipment) throw conflict(shopOrder.status, 'This order has no parcel to book.')
    const from = shipment.status as ShipmentStatus
    assertDispatchAllowed(order, from)
    if (shopOrder.status !== 'accepted')
      throw conflict(shopOrder.status, 'Accept the order before booking a courier.')
    assertTransition(COURIER_SHIPMENT, from, 'booking_requested')

    const terms = await bookingTerms(trx, command.shopId, command.accountId)
    const ownerType = OWNER_TYPE_OF_MODE[terms.fulfillmentMode]
    if (!ownerType) {
      throw conflict(from, 'Choose your courier account in the shipping settings before booking.')
    }
    if (!terms.isEnabled) throw conflict(from, 'Courier booking is switched off for this shop.')
    const account = terms.account
    if (
      !account ||
      !terms.linkActive ||
      account.ownerType !== ownerType ||
      account.status !== 'active' ||
      !account.providerActive
    ) {
      throw invalid('account_id', 'account_not_usable', 'This courier account cannot book now.')
    }
    if (account.ownerType === 'platform' && terms.ownAccountActive) {
      throw invalid(
        'account_id',
        'own_account_active',
        'This shop has its own active courier account. Switch to the vendor mode to book with it.'
      )
    }
    if (app.inProduction && account.environment !== 'production') {
      throw invalid('account_id', 'sandbox_account', 'A sandbox account cannot book real parcels.')
    }
    if (!courierServices(account.providerCode).includes(command.serviceCode)) {
      throw invalid('service_code', 'unknown_service', 'This courier does not offer that service.')
    }

    // FOR KEY SHARE: an archive or edit (FOR UPDATE) of this address waits for the booking.
    const addressRows = await trx.rawQuery(
      `SELECT id FROM shop_addresses
       WHERE id = ? AND shop_id = ? AND purpose = 'pickup' AND archived_at IS NULL
       FOR KEY SHARE`,
      [command.pickupAddressId, command.shopId]
    )
    const address = addressRows.rows[0] as { id: string } | undefined
    if (!address)
      throw invalid(
        'pickup_address_id',
        'address_not_usable',
        'Choose one of your pickup addresses.'
      )

    const branchesNeeded = courierCapabilitiesOf(account.providerCode)?.branches ?? false
    if (branchesNeeded) {
      for (const [field, id] of [
        ['origin_branch_id', command.originBranchId],
        ['destination_branch_id', command.destinationBranchId],
      ] as const) {
        if (!id) throw invalid(field, 'required', 'Choose the courier branch.')
        const branch = await trx.from('logistics_branches').where('id', id).first()
        // A branch of another courier is refused here (T-SHOP-114).
        if (!branch || !branch.is_active || branch.provider_code !== account.providerCode) {
          throw invalid(
            field,
            'branch_not_usable',
            'This branch is not one of the courier’s active branches.'
          )
        }
      }
    } else if (command.originBranchId || command.destinationBranchId) {
      throw invalid('origin_branch_id', 'not_allowed', 'This courier does not book by branch.')
    }

    // The COD amount the courier collects (R1: COD only; a gateway order is R1.1).
    const cod = await trx
      .from('payments')
      .where({ shop_order_id: shopOrder.id, method: 'cod' })
      .forUpdate()
      .first()
    if (!cod || cod.status !== 'awaiting_collection') {
      throw conflict(from, 'The cash-on-delivery payment of this order cannot be collected now.')
    }
    if (
      account.ownerType === 'platform' &&
      !(await settingIn(trx, 'platform_account_cod_enabled', false))
    ) {
      throw conflict(
        from,
        'Cash on delivery is not yet available on the platform courier account. Ship this parcel yourself.'
      )
    }

    const references = await trx
      .from('shipments')
      .where('shop_order_id', shopOrder.id)
      .whereNotNull('merchant_reference')
      .count('* as n')
      .first()
    const merchantReference = `${shopOrder.number}-S${Number(references?.n ?? 0) + 1}`

    const lines = await trx
      .from('order_items')
      .where('shop_order_id', shopOrder.id)
      .select('id', 'quantity', 'rejected_quantity', 'cancelled_quantity')
    const kept = lines
      .map((line) => ({
        id: line.id as string,
        quantity:
          Number(line.quantity) - Number(line.rejected_quantity) - Number(line.cancelled_quantity),
      }))
      .filter((line) => line.quantity > 0)
    if (kept.length === 0) throw conflict(from, 'No units of this order are left to ship.')
    await trx.table('shipment_items').insert(
      kept.map((line) => ({
        shipment_id: shipment.id,
        order_item_id: line.id,
        shop_order_id: shopOrder.id,
        quantity: line.quantity,
      }))
    )

    const changed = await trx
      .from('shipments')
      .where({ id: shipment.id, shop_id: command.shopId, status: from })
      .update({
        status: 'booking_requested',
        logistics_account_id: account.id,
        pickup_address_id: address.id,
        merchant_reference: merchantReference,
        service_code: command.serviceCode,
        courier_name: account.providerName,
        cod_amount_minor: cod.amount_minor,
        origin_branch_id: command.originBranchId,
        destination_branch_id: command.destinationBranchId,
        version: trx.raw('version + 1'),
        updated_at: trx.raw('now()'),
      })
      .returning('id')
    if (changed.length !== 1) throw new InvalidStateTransition(from, ['booking_requested'])

    await trx.table('shipment_events').insert({
      shipment_id: shipment.id,
      shop_id: command.shopId,
      event: 'booking_requested',
      status: 'booking_requested',
      actor_type: 'shop_member',
      actor_user_id: context.actor.userId,
    })
    await recordAudit(trx, {
      actorType: context.actor.type,
      actorUserId: context.actor.userId,
      actorRole: context.actor.role,
      requestId: context.actor.requestId,
      ipHash: context.actor.ipHash ?? null,
      action: 'shipment.book_request',
      subjectType: 'shipment',
      subjectId: shipment.id,
      shopId: command.shopId,
      changes: {
        status: { from, to: 'booking_requested' },
        logistics_account_id: account.id,
        merchant_reference: merchantReference,
        service_code: command.serviceCode,
      },
    })
    await sendJob(trx, 'orders.book_courier_shipment', {
      shipment_id: shipment.id,
      shop_id: command.shopId,
      request_id: context.actor.requestId,
      causation_id: null,
    })
    const view = (await shipmentById(trx, shipment.id))!
    return { status: 200, body: context.present(view) }
  })
}
