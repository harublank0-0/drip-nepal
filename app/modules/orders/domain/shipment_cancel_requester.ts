/*
 * `shipments.cancel_requested_by` (docs/04a §11.5): the values of
 * `shipments_cancel_request_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SHIPMENT_CANCEL_REQUESTERS = ['vendor', 'shop_order'] as const
export type ShipmentCancelRequester = (typeof SHIPMENT_CANCEL_REQUESTERS)[number]
