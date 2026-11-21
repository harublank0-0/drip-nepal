import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError, InvalidStateTransition } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import {
  assignedPickupBranches,
  courierCapabilitiesOf,
  courierServices,
} from '#modules/logistics/actions/courier_calls'
import { closeHeldEvent, courierEvent } from '#modules/logistics/actions/courier_events'
import { accountsUsableByShop, activeBranches, logisticsSettings } from '#modules/logistics/queries'
import type { Actor } from '#modules/platform/actor'
import { raiseAlert } from '#modules/platform/alerts'
import { idempotentTx, type IdempotencyScope } from '#modules/platform/idempotency'
import { sendJob } from '#modules/platform/jobs'
import { withTx } from '#modules/platform/tx'
import { lockShipmentChain } from '#modules/orders/actions/book_courier_shipment'
import {
  liveShipmentOf,
  sellerShopOrder,
  shipmentById,
  type ShipmentRow,
  type ShipmentView,
} from '#modules/orders/queries'

/*
 * The courier booking operations around `bookCourierShipment` (docs/06 §13.8,
 * docs/05 §6.3; M6): the vendor's cancellation, the booking form's options,
 * and the staff operations on bookings and held readings. NCM has no
 * cancellation API, so a cancellation of a `booked` parcel is a request that
 * staff carry out with the courier and then record (05 §6.3 "Without
 * `cancellation`"). The cancellations a shop order's own cancellation asks
 * for (`adminCancelShopOrder`, `orders.handle_shop_suspension`) come with
 * those operations (M7 and the suspension work).
 */

const audit = (actor: Actor) => ({
  actorType: actor.type,
  actorUserId: actor.userId,
  actorRole: actor.role,
  requestId: actor.requestId,
  ipHash: actor.ipHash ?? null,
})

function conflict(current: string, detail: string, allowed: string[] = []) {
  return new DomainError('INVALID_STATE_TRANSITION', {
    detail,
    extensions: { current_status: current, allowed_events: allowed },
  })
}

async function shipmentEvent(
  trx: TransactionClientContract,
  shipment: Pick<ShipmentRow, 'id' | 'shop_id'>,
  status: string,
  actor: Actor
) {
  await trx.table('shipment_events').insert({
    shipment_id: shipment.id,
    shop_id: shipment.shop_id,
    event: status,
    status,
    actor_type:
      actor.type === 'shop_member'
        ? 'shop_member'
        : actor.type === 'platform_staff'
          ? 'platform_staff'
          : 'system',
    actor_user_id: actor.type === 'system' ? null : actor.userId,
  })
}

// `booking_failed` → `cancelled`, with a new `pending` shipment so the vendor can book again.
async function cancelFailedBooking(
  trx: TransactionClientContract,
  shipment: ShipmentRow,
  actor: Actor
) {
  await trx
    .from('shipments')
    .where({ id: shipment.id, status: shipment.status })
    .update({
      status: 'cancelled',
      cancelled_at: trx.raw('now()'),
      cancel_requested_at: null,
      cancel_requested_by: null,
      version: trx.raw('version + 1'),
      updated_at: trx.raw('now()'),
    })
  await shipmentEvent(trx, shipment, 'cancelled', actor)
  const [fresh] = await trx
    .table('shipments')
    .insert({ shop_order_id: shipment.shop_order_id, shop_id: shipment.shop_id })
    .returning('id')
  return fresh.id as string
}

export async function cancelCourierBooking<T>(
  command: { shopId: string; shopOrderNumber: string; reason: string | null },
  context: {
    actor: Actor
    idempotency: IdempotencyScope | null
    present: (shipment: ShipmentView) => T
  }
) {
  return idempotentTx(context.idempotency, async (trx) => {
    const { shipment } = await lockShipmentChain(trx, command.shopOrderNumber, command.shopId)
    if (!shipment || !shipment.logistics_account_id) {
      throw conflict(shipment?.status ?? 'none', 'This parcel has no courier booking.')
    }
    let resultId = shipment.id as string
    if (shipment.status === 'booking_failed') {
      resultId = await cancelFailedBooking(trx, shipment, context.actor)
      await recordAudit(trx, {
        ...audit(context.actor),
        action: 'shipment.cancel',
        subjectType: 'shipment',
        subjectId: shipment.id,
        shopId: command.shopId,
        changes: { status: { from: 'booking_failed', to: 'cancelled' }, new_shipment_id: resultId },
        reason: command.reason,
      })
    } else if (shipment.status === 'booked') {
      if (shipment.cancel_requested_at)
        throw conflict('booked', 'A cancellation of this parcel is already requested.')
      const provider = await trx
        .from('logistics_accounts')
        .where('id', shipment.logistics_account_id)
        .select('provider_code')
        .first()
      if (courierCapabilitiesOf(provider.provider_code)?.cancellation) {
        // No R1 courier cancels by API; the job for one that does comes with that courier.
        throw conflict('booked', 'This courier cancels through its own job, not available yet.')
      }
      await trx
        .from('shipments')
        .where({ id: shipment.id, status: 'booked' })
        .update({
          cancel_requested_at: trx.raw('now()'),
          cancel_requested_by: 'vendor',
          version: trx.raw('version + 1'),
          updated_at: trx.raw('now()'),
        })
      raiseAlert('courier.cancellation_requested', {
        shipment_id: shipment.id,
        requested_by: 'vendor',
      })
      await recordAudit(trx, {
        ...audit(context.actor),
        action: 'shipment.cancel_request',
        subjectType: 'shipment',
        subjectId: shipment.id,
        shopId: command.shopId,
        changes: { cancel_requested_by: 'vendor' },
        reason: command.reason,
      })
    } else {
      throw conflict(
        shipment.status,
        shipment.status === 'booking_requested' || shipment.status === 'needs_reconciliation'
          ? 'The booking’s outcome is not known yet. Try again once it is.'
          : 'This parcel can no longer be cancelled.'
      )
    }
    return { status: 200, body: context.present((await shipmentById(trx, resultId))!) }
  })
}

// Staff record what they learned from the courier (docs/06 §13.8 `adminResolveCourierBooking`).
export async function resolveCourierBooking<T>(
  command: {
    shopOrderNumber: string
    outcome: 'booked' | 'booking_failed' | 'cancelled' | 'cancel_declined'
    externalShipmentId: string | null
    note: string
  },
  context: {
    actor: Actor
    idempotency: IdempotencyScope | null
    present: (shipment: ShipmentView) => T
  }
) {
  return idempotentTx(context.idempotency, async (trx) => {
    const { shipment } = await lockShipmentChain(trx, command.shopOrderNumber)
    if (!shipment || !shipment.logistics_account_id) {
      throw conflict(shipment?.status ?? 'none', 'This parcel has no courier booking.')
    }
    let resultId = shipment.id as string
    let action = 'shipment.booking_resolve'
    const changes: Record<string, string | null> = { outcome: command.outcome }
    if (command.outcome === 'booked' || command.outcome === 'booking_failed') {
      if (shipment.status !== 'needs_reconciliation') {
        throw new InvalidStateTransition(
          shipment.status,
          shipment.status === 'booked' && shipment.cancel_requested_at ? ['cancelled'] : []
        )
      }
      if (command.outcome === 'booked') {
        if (!command.externalShipmentId) {
          throw new DomainError('VALIDATION_FAILED', {
            errors: [
              {
                field: 'external_shipment_id',
                code: 'required',
                message: 'Enter the courier’s parcel ID.',
              },
            ],
          })
        }
        const taken = await trx
          .from('shipments')
          .where({
            logistics_account_id: shipment.logistics_account_id,
            external_shipment_id: command.externalShipmentId,
          })
          .whereNot('id', shipment.id)
          .first()
        if (taken) {
          throw new DomainError('VALIDATION_FAILED', {
            errors: [
              {
                field: 'external_shipment_id',
                code: 'already_used',
                message: 'This parcel ID belongs to another shipment.',
              },
            ],
          })
        }
      }
      await trx
        .from('shipments')
        .where({ id: shipment.id, status: 'needs_reconciliation' })
        .update({
          status: command.outcome,
          ...(command.outcome === 'booked'
            ? {
                external_shipment_id: command.externalShipmentId,
                tracking_number: command.externalShipmentId!.slice(0, 64),
                booked_at: trx.raw('now()'),
              }
            : {}),
          version: trx.raw('version + 1'),
          updated_at: trx.raw('now()'),
        })
      await shipmentEvent(trx, shipment, command.outcome, context.actor)
      changes.external_shipment_id = command.externalShipmentId
    } else {
      if (shipment.status !== 'booked' || !shipment.cancel_requested_at) {
        throw new InvalidStateTransition(
          shipment.status,
          shipment.status === 'needs_reconciliation' ? ['booked', 'booking_failed'] : []
        )
      }
      if (command.outcome === 'cancel_declined') {
        action = 'shipment.cancel_decline'
        await trx
          .from('shipments')
          .where({ id: shipment.id, status: 'booked' })
          .update({
            cancel_requested_at: null,
            cancel_requested_by: null,
            version: trx.raw('version + 1'),
            updated_at: trx.raw('now()'),
          })
      } else {
        if (shipment.cancel_requested_by !== 'vendor') {
          // A shop order's own cancellation request comes with M7's adminCancelShopOrder.
          throw conflict(
            'booked',
            'This cancellation also ends the shop order, which is not available yet.'
          )
        }
        action = 'shipment.cancel'
        resultId = await cancelFailedBooking(trx, shipment, context.actor)
        changes.new_shipment_id = resultId
      }
    }
    await recordAudit(trx, {
      ...audit(context.actor),
      action,
      subjectType: 'shipment',
      subjectId: shipment.id,
      shopId: shipment.shop_id,
      changes,
      reason: command.note,
    })
    return { status: 200, body: context.present((await shipmentById(trx, resultId))!) }
  })
}

// Staff read a parcel's history again now (`adminRefreshCourierStatus`).
export async function refreshCourierStatus(shopOrderNumber: string, actor: Actor) {
  await withTx(async (trx) => {
    const { shipment } = await lockShipmentChain(trx, shopOrderNumber)
    if (!shipment?.external_shipment_id) {
      throw conflict(shipment?.status ?? 'none', 'This parcel has no courier booking to read.')
    }
    await sendJob(trx, 'orders.process_courier_event', {
      shipment_id: shipment.id,
      shop_id: shipment.shop_id,
      courier_event_id: null,
      request_id: actor.requestId,
      causation_id: null,
    })
  })
}

// Staff close a held reading after acting on it; the replay continues (`adminResolveCourierEvent`).
export async function resolveCourierEvent(
  command: { eventId: string; status: 'applied' | 'ignored'; note: string },
  actor: Actor
) {
  const existing = await courierEvent(command.eventId)
  if (!existing) throw new DomainError('NOT_FOUND')
  await withTx(async (trx) => {
    const closed = await closeHeldEvent(trx, command.eventId, command.status)
    if (!closed) throw new InvalidStateTransition(existing.processing_status, [])
    await recordAudit(trx, {
      ...audit(actor),
      action: 'courier_event.resolve',
      subjectType: 'courier_event',
      subjectId: command.eventId,
      shopId: closed.shop_id,
      changes: { processing_status: { from: 'held', to: command.status } },
      reason: command.note,
    })
    if (closed.shipment_id) {
      await sendJob(trx, 'orders.process_courier_event', {
        shipment_id: closed.shipment_id,
        shop_id: closed.shop_id,
        courier_event_id: null,
        request_id: actor.requestId,
        causation_id: null,
      })
    }
  })
  return courierEvent(command.eventId)
}

/*
 * `adminRecordOrderVerification` (OD-57, FR-ORD-009; docs/06 §13.8): staff
 * record the platform's customer check. The `orders` row is locked first
 * (docs/05 §4.4 level 3), so a dispatch action cannot race the change. Setting
 * `review_required` or `failed` on an order with a parcel already `booked`
 * raises an alert: staff cancel the booking or resolve the verification.
 */
export async function recordOrderVerification(
  command: {
    orderNumber: string
    status: 'verified' | 'review_required' | 'failed'
    method: 'phone_call' | 'manual'
    notes: string | null
  },
  actor: Actor
) {
  return withTx(async (trx) => {
    const order = await trx.from('orders').where('number', command.orderNumber).forUpdate().first()
    if (!order) throw new DomainError('NOT_FOUND')
    await trx
      .from('orders')
      .where('id', order.id)
      .update({
        verification_status: command.status,
        verification_method: command.method,
        verified_at: command.status === 'verified' ? trx.raw('now()') : null,
        verification_notes: command.notes,
        updated_at: trx.raw('now()'),
      })
    await recordAudit(trx, {
      ...audit(actor),
      action: 'order.verify',
      subjectType: 'order',
      subjectId: order.id,
      changes: {
        verification_status: { from: order.verification_status, to: command.status },
        verification_method: command.method,
      },
    })
    if (command.status !== 'verified') {
      const booked = await trx
        .from('shipments as s')
        .join('shop_orders as so', 'so.id', 's.shop_order_id')
        .where('so.order_id', order.id)
        .where('s.status', 'booked')
        .select('s.id')
      for (const row of booked) {
        raiseAlert('order.verification_after_booking', {
          order_id: order.id,
          shipment_id: row.id,
          status: command.status,
        })
      }
    }
    return trx
      .from('orders')
      .where('id', order.id)
      .select(
        'id',
        'number',
        'status',
        'verification_status',
        'verification_method',
        'verified_at',
        'verification_notes'
      )
      .first()
  })
}

/*
 * What the booking form offers (`getCourierBookingOptions`): the accounts the
 * shop may book through, its pickup addresses (read by the caller from
 * `shops`), the courier's services, the account's assigned origin branches
 * (read live and cached, null when the courier did not answer) and the
 * destination branches suggested from the delivery district.
 */
export async function courierBookingOptions(command: {
  shopId: string
  shopOrderNumber: string
  accountId: string | null
}) {
  const shopOrder = await sellerShopOrder(command.shopId, command.shopOrderNumber)
  if (!shopOrder) throw new DomainError('NOT_FOUND')
  const shipment = await liveShipmentOf(db, shopOrder.id)
  const settings = await logisticsSettings(command.shopId)
  const usable = await accountsUsableByShop(command.shopId)
  const accounts = usable.filter(
    (account) => account.status === 'active' && account.ownerType === 'shop'
  )
  const chosen =
    accounts.find((account) => account.id === command.accountId) ??
    accounts.find((account) => account.id === settings.defaultAccountId) ??
    accounts[0] ??
    null
  const order = await db
    .from('orders')
    .where('id', shopOrder.order_id)
    .select('shipping_district_code')
    .first()
  let origin: string[] | null = []
  let destinations: Awaited<ReturnType<typeof activeBranches>> = []
  let services: readonly string[] = []
  let branches: Awaited<ReturnType<typeof activeBranches>> = []
  if (chosen) {
    services = courierServices(chosen.providerCode)
    if (courierCapabilitiesOf(chosen.providerCode)?.branches) {
      branches = await activeBranches(chosen.providerCode)
      origin = await assignedPickupBranches(chosen.id)
      destinations = branches.filter(
        (branch) => branch.districtCode === order?.shipping_district_code
      )
    }
  }
  const assigned = origin === null ? null : new Set(origin.map((name) => name.toLowerCase()))
  return {
    shipment,
    settings,
    accounts,
    accountId: chosen?.id ?? null,
    services,
    assignedBranchesAvailable: origin !== null,
    originBranches: assigned
      ? branches.filter((branch) => assigned.has(branch.name.toLowerCase()))
      : [],
    destinationBranches: destinations,
  }
}
