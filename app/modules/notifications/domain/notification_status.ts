/*
 * `notification_deliveries.status` (docs/04a §14.3): the values of
 * `notification_deliveries_status_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4).
 */
export const NOTIFICATION_STATUSES = ['queued', 'sent', 'failed'] as const
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number]
