import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { attemptsOf } from '#modules/logistics/actions/booking_attempts'
import { listCourierEvents } from '#modules/logistics/actions/courier_events'
import {
  recordOrderVerification,
  refreshCourierStatus,
  resolveCourierBooking,
  resolveCourierEvent,
} from '#modules/orders/actions/courier_bookings'
import { courierBookingQueue } from '#modules/orders/queries'
import { attemptJson, courierEventJson, shipmentJson } from '#transformers/courier_transformer'
import { idempotencyScope, page, sendIdempotent, staffActor } from '#controllers/support/http'
import { assertKnownMembers } from '#validators/support/strict_keys'
import {
  RESOLVE_BOOKING_MEMBERS,
  RESOLVE_EVENT_MEMBERS,
  VERIFICATION_MEMBERS,
  recordOrderVerificationValidator,
  resolveCourierBookingValidator,
  resolveCourierEventValidator,
} from '#validators/admin/logistics'

/*
 * Staff work on courier bookings and readings (docs/06 §13.8; M6), under
 * `platform.orders.intervene`, and the OD-57 order verification. No step-up
 * (07 §3.10 lists none of these).
 */
export default class AdminCourierBookingsController {
  // adminListCourierBookings
  async queue(ctx: HttpContext) {
    const queue = ctx.request.input('queue', 'needs_reconciliation')
    if (queue !== 'needs_reconciliation' && queue !== 'cancel_requested') {
      throw new DomainError('VALIDATION_FAILED', {
        errors: [{ field: 'queue', code: 'invalid', message: 'Unknown queue.' }],
      })
    }
    const { limit, after } = page(ctx)
    const result = await courierBookingQueue({ queue, limit, after })
    const attempts = await attemptsOf(result.shipments.map((shipment) => shipment.id))
    return {
      data: result.shipments.map((shipment) => ({
        ...shipmentJson(shipment),
        attempts: attempts.filter((row) => row.shipment_id === shipment.id).map(attemptJson),
      })),
      meta: { next_cursor: result.next },
    }
  }

  // adminResolveCourierBooking ⚷
  async resolve(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), RESOLVE_BOOKING_MEMBERS)
    const input = await ctx.request.validateUsing(resolveCourierBookingValidator)
    const result = await resolveCourierBooking(
      {
        shopOrderNumber: ctx.params.shopOrderNumber,
        outcome: input.outcome,
        externalShipmentId: input.external_shipment_id ?? null,
        note: input.note,
      },
      {
        actor: staffActor(ctx),
        idempotency: idempotencyScope(ctx, 'adminResolveCourierBooking', input),
        present: (shipment) => ({ data: shipmentJson(shipment) }),
      }
    )
    return sendIdempotent(ctx, result)
  }

  // adminRefreshCourierStatus
  async refresh(ctx: HttpContext) {
    await refreshCourierStatus(ctx.params.shopOrderNumber, staffActor(ctx))
    return ctx.response.accepted({ data: { queued: true } })
  }

  // adminListCourierEvents
  async events(ctx: HttpContext) {
    const { limit, after } = page(ctx)
    const status = ctx.request.input('processing_status')
    const shipmentId = ctx.request.input('shipment_id')
    const result = await listCourierEvents({
      processingStatus: typeof status === 'string' ? status : undefined,
      shipmentId:
        typeof shipmentId === 'string' && /^[\da-f-]{36}$/i.test(shipmentId)
          ? shipmentId
          : undefined,
      limit,
      after,
    })
    return { data: result.events.map(courierEventJson), meta: { next_cursor: result.next } }
  }

  // adminResolveCourierEvent
  async resolveEvent(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), RESOLVE_EVENT_MEMBERS)
    const input = await ctx.request.validateUsing(resolveCourierEventValidator)
    const row = await resolveCourierEvent(
      { eventId: ctx.params.courierEventId, status: input.processing_status, note: input.note },
      staffActor(ctx)
    )
    return { data: courierEventJson(row) }
  }

  // adminRecordOrderVerification (OD-57)
  async verify(ctx: HttpContext) {
    assertKnownMembers(ctx.request.body(), VERIFICATION_MEMBERS)
    const input = await ctx.request.validateUsing(recordOrderVerificationValidator)
    const order = await recordOrderVerification(
      {
        orderNumber: ctx.params.orderNumber,
        status: input.verification_status,
        method: input.verification_method,
        notes: input.verification_notes ?? null,
      },
      staffActor(ctx)
    )
    return {
      data: {
        number: order.number,
        status: order.status,
        verification_status: order.verification_status,
        verification_method: order.verification_method,
        verified_at: order.verified_at ? new Date(order.verified_at).toISOString() : null,
        verification_notes: order.verification_notes,
      },
    }
  }
}
