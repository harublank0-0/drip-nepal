/*
 * `notification_deliveries.channel` (docs/04a §14.3): the values of
 * `notification_deliveries_channel_check`, in its order. T-ARCH-011 fails if
 * the two differ (docs/04 §2.4). R2 adds `sms` by swapping the CHECK.
 */
export const NOTIFICATION_CHANNELS = ['email'] as const
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number]
