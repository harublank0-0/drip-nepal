import type { CourierMappedStatus } from '#modules/logistics/domain/courier_mapped_status'

/*
 * Nepal Can Move's status labels to normalised shipment statuses: the
 * table "Nepal Can Move mapping" of docs/05 §6.3, from NCM's API document
 * v2 and webhook document v1.1 [Verify-external VX-16]. A pure function of
 * (label, the shipment's current status) (ADR-0019 decision 6), tested by
 * T-FUL-108.
 *
 * It reads labels only. NCM does not sign callbacks, so a callback's event
 * is never applied: it triggers a read of the parcel's history, whose
 * labels are mapped here one by one (05 §6.3 "Replaying a status
 * history"). It says what the courier reports, not whether the shipment may
 * move, and it sends nothing: the job that applies the result owns the
 * transaction, the notices and the alerts, and holds what the machine
 * refuses (`courier_events.hold_reason = 'not_allowed'`). The return check
 * before a `delivered` is applied is also the job's.
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
  | 'returning'
  | 'back_with_vendor'
  | 'courier_refund'

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
  'order marked return': 'returning',
  'sent to vendor': 'returning',
  'send to vendor': 'returning',
  'rtv delivered': 'back_with_vendor',
  'refund initiated': 'courier_refund',
}

// `Dispatched to <branch>` and `Arrived at <branch>` match by their prefix (05 §6.3).
const IN_TRANSIT_PREFIXES = ['dispatched to ', 'arrived at ']

/*
 * Case and repeated spaces are not treated as meaning anything; any other
 * difference is a new label.
 */
export function normaliseLabel(label: string) {
  return label.trim().replace(/\s+/g, ' ').toLowerCase()
}

function stageOf(label: string): Stage | undefined {
  const normalised = normaliseLabel(label)
  if (Object.hasOwn(LABELS, normalised)) return LABELS[normalised]
  return IN_TRANSIT_PREFIXES.some((prefix) => normalised.startsWith(prefix))
    ? 'in_transit'
    : undefined
}

const IN_TRANSIT: ReadonlySet<string> = new Set(['shipped', 'out_for_delivery'])

// `currentStatus` is the shipment's `status` (docs/04a §11.5).
export function mapNcmLabel(label: string, currentStatus: string): NcmMapping {
  switch (stageOf(label)) {
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
    case 'returning':
      // NCM reports no failed attempt, so a return while in transit is both (05 §6.3).
      if (currentStatus === 'returning') return { kind: 'none', notice: null }
      return IN_TRANSIT.has(currentStatus)
        ? { kind: 'transition', statuses: ['delivery_failed', 'returning'] }
        : { kind: 'transition', statuses: ['returning'] }
    case 'back_with_vendor':
      return { kind: 'none', notice: 'record_returned_to_origin' }
    case 'courier_refund':
      return { kind: 'none', notice: 'courier_refund' }
  }
}
