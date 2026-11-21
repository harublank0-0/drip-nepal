import { ShipmentBookingAttemptSchema } from '#database/schema'

/*
 * docs/04a §9.13 (logistics, M6): one courier call that books, cancels or
 * looks up a shipment's booking. `logistics` sits below `orders`, so the
 * shipment is read from the `Shipment` side.
 */
export default class ShipmentBookingAttempt extends ShipmentBookingAttemptSchema {}
