import type { CourierMappedStatus } from '#modules/logistics/domain/courier_mapped_status'

/*
 * Nepal Can Move's events and status labels to normalised shipment
 * statuses: the table "Nepal Can Move mapping" of docs/05 §6.3, from NCM's
 * API document v2 and webhook document v1.1 [Verify-external VX-16]. A pure
 * function (ADR-0019 decision 6), tested by T-FUL-108.
 *
 * It says what the courier reports, not whether the shipment may move: the
 * orders module checks the transition against the machine and holds what
 * it refuses (`courier_events.hold_reason = 'not_allowed'`).
 */

export type NcmMappingNotice =
  // The parcel is back with the vendor, who records `returned_to_origin` (05 §6.3).
  | 'record_returned_to_origin'
  // NCM's own refund flow; R1 refunds are DripNepal's, so staff look at it.
  | 'courier_refund'

export type NcmMapping =
  // Apply these statuses in order, in one transaction (`delivery_failed` then `returning`).
  | { kind: 'transition'; statuses: CourierMappedStatus[] }
  // A known stage that moves nothing (`courier_events.processing_status = 'ignored'`).
  | { kind: 'none'; notice: NcmMappingNotice | null }
  // A label the table does not know: held with `unmapped_status` and an admin alert.
  | { kind: 'unmapped' }

type Stage =
  | 'booking_stands'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'marked_return'
  | 'sent_to_vendor'
  | 'back_with_vendor'
  | 'courier_refund'

// NCM tells consumers to decide by `event`, not by the display label (webhook doc v1.1).
const EVENTS: Record<string, Stage> = {
  pickup_completed: 'picked_up',
  dropoff_collected: 'picked_up',
  order_dispatched: 'in_transit',
  order_arrived: 'in_transit',
  sent_for_delivery: 'out_for_delivery',
  delivery_completed: 'delivered',
  order_marked_rtv: 'marked_return',
  send_to_vendor: 'sent_to_vendor',
  rtv_delivery: 'back_with_vendor',
  refund_initiated: 'courier_refund',
}

// Status labels from polls and lookups, compared after `normaliseLabel`.
const LABELS: Record<string, Stage> = {
  'pickup order created': 'booking_stands',
  'drop off order created': 'booking_stands',
  'sent for pickup': 'booking_stands',
  'pickup complete': 'picked_up',
  'drop off order collected': 'picked_up',
  'dispatched': 'in_transit',
  'arrived': 'in_transit',
  'sent for delivery': 'out_for_delivery',
  'delivered': 'delivered',
  'order marked return': 'marked_return',
  'sent to vendor': 'sent_to_vendor',
  'send to vendor': 'sent_to_vendor',
  'rtv delivered': 'back_with_vendor',
}

/*
 * NCM's examples write labels in title case. Case and repeated spaces are
 * not treated as meaning anything; any other difference is a new label.
 */
export function normaliseLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

const IN_TRANSIT: ReadonlySet<string> = new Set(['shipped', 'out_for_delivery'])

/*
 * `currentStatus` is the shipment's `status` (docs/04a §11.5). When NCM
 * sends both an event and a label, the event decides.
 */
export function mapNcmUpdate(
  update: { rawEvent: string | null; rawStatus: string | null },
  currentStatus: string
): NcmMapping {
  const stage =
    update.rawEvent !== null && update.rawEvent !== ''
      ? EVENTS[update.rawEvent.trim()]
      : update.rawStatus !== null
        ? LABELS[normaliseLabel(update.rawStatus)]
        : undefined

  switch (stage) {
    case undefined:
      return { kind: 'unmapped' }
    case 'booking_stands':
    case 'in_transit':
      return { kind: 'none', notice: null }
    case 'picked_up':
      return { kind: 'transition', statuses: ['shipped'] }
    case 'out_for_delivery':
      return { kind: 'transition', statuses: ['out_for_delivery'] }
    case 'delivered':
      // NCM ends a parcel returned to the vendor as `Delivered` too.
      return currentStatus === 'returning'
        ? { kind: 'none', notice: 'record_returned_to_origin' }
        : { kind: 'transition', statuses: ['delivered'] }
    case 'marked_return':
      // NCM reports no failed attempt, so a return marked in transit is both (05 §6.3).
      return IN_TRANSIT.has(currentStatus)
        ? { kind: 'transition', statuses: ['delivery_failed', 'returning'] }
        : currentStatus === 'returning'
          ? { kind: 'none', notice: null }
          : { kind: 'transition', statuses: ['returning'] }
    case 'sent_to_vendor':
      return currentStatus === 'returning'
        ? { kind: 'none', notice: null }
        : { kind: 'transition', statuses: ['returning'] }
    case 'back_with_vendor':
      return { kind: 'none', notice: 'record_returned_to_origin' }
    case 'courier_refund':
      return { kind: 'none', notice: 'courier_refund' }
  }
}
