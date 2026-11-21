import { CourierEventSchema } from '#database/schema'

/*
 * docs/04a §9.14 (logistics, M6): one courier status message in the inbox.
 * `logistics` sits below `orders`, so the shipment is read from its side.
 */
export default class CourierEvent extends CourierEventSchema {}
