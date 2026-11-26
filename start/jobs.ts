import { rebuildListings } from '#modules/catalog/jobs/rebuild_listings'
import { refreshListing } from '#modules/catalog/jobs/refresh_listing'
import { revokeSessions } from '#modules/identity/jobs/revoke_sessions'
import { verifyAccount } from '#modules/logistics/jobs/verify_account'
import { syncBranches } from '#modules/logistics/jobs/sync_branches'
import { cleanupAbandoned } from '#modules/media/jobs/cleanup_abandoned'
import { processUpload } from '#modules/media/jobs/process_upload'
import { dispatchNotification } from '#modules/notifications/jobs/dispatch'
import { sendEmail } from '#modules/notifications/jobs/send_email'
import { bookCourierShipmentJob } from '#modules/orders/jobs/book_courier_shipment'
import { processCourierEventJob } from '#modules/orders/jobs/process_courier_event'
import {
  pollCourierStatuses,
  sweepCourierBookings,
  sweepCourierEvents,
} from '#modules/orders/jobs/courier_schedules'
import type { JobEnvelope, JobPayloads, QueueName } from '#modules/platform/jobs'

/*
 * The handlers `node ace jobs:work` registers, and the schedules it starts
 * (docs/03 §9; times in Asia/Kathmandu). A queue of `JOB_QUEUES` without a
 * handler here would wait for its milestone; today every one has one. Each
 * handler gets the payload and the attempt it holds, so a job can tell its
 * last retry.
 */

export type JobAttempt = { retryCount: number; retryLimit: number; requestId: string | null }

type Handler<Q extends QueueName> = (
  payload: JobPayloads[Q] & JobEnvelope,
  attempt: JobAttempt
) => Promise<unknown>

export const JOB_HANDLERS: { [Q in QueueName]?: Handler<Q> } = {
  // M1 part 1b: the token emails (docs/03 §9, docs/04a §14.3).
  'notifications.dispatch': (payload) => dispatchNotification(payload),
  'notifications.send_email': (payload) => sendEmail(payload),
  // M1 part 4: sessions that no longer hold the user's stamp (docs/03 §9, docs/07 §3.3).
  'identity.revoke_sessions': (payload) => revokeSessions(payload),
  // R1-S part 2a: the listing read model (docs/04a §7.12).
  'catalog.refresh_listing': (payload) => refreshListing(payload),
  // R1-S part 2e-i: the nightly full recompute (docs/03 §9, ADR-0014).
  'catalog.rebuild_listings': (_payload, attempt) => rebuildListings(attempt.requestId),
  // R1-S part 2d-ii: the image worker and the daily cleanup (ADR-0013 decisions 3 and 6).
  'media.process_upload': (payload) => processUpload(payload),
  'media.cleanup_abandoned': (_payload, attempt) => cleanupAbandoned(attempt.requestId),
  'logistics.verify_account': (payload) => verifyAccount(payload),
  'logistics.sync_branches': (payload) => syncBranches(payload),
  'orders.book_courier_shipment': (payload, attempt) => bookCourierShipmentJob(payload, attempt),
  'orders.process_courier_event': (payload, attempt) => processCourierEventJob(payload, attempt),
  'orders.poll_courier_statuses': (_payload, attempt) => pollCourierStatuses(attempt.requestId),
  'orders.sweep_courier_bookings': (_payload, attempt) => sweepCourierBookings(attempt.requestId),
  'orders.sweep_courier_events': (_payload, attempt) => sweepCourierEvents(attempt.requestId),
}

export const JOB_SCHEDULES: { queue: QueueName; cron: string; data: object }[] = [
  { queue: 'orders.poll_courier_statuses', cron: '*/30 * * * *', data: {} },
  { queue: 'orders.sweep_courier_bookings', cron: '*/5 * * * *', data: {} },
  { queue: 'orders.sweep_courier_events', cron: '*/15 * * * *', data: {} },
  // Daily at 02:30 (docs/04a §9.12).
  { queue: 'logistics.sync_branches', cron: '30 2 * * *', data: { provider_code: 'ncm' } },
  // Daily at 02:45 (docs/03 §9, ADR-0013 decision 6).
  { queue: 'media.cleanup_abandoned', cron: '45 2 * * *', data: {} },
  // Daily at 03:30 (docs/03 §9, ADR-0014).
  { queue: 'catalog.rebuild_listings', cron: '30 3 * * *', data: {} },
]

/*
 * How many jobs of a queue the worker runs at once; 2 unless listed. Images
 * one at a time (docs/11 §13.2, 03 §7.5): one decode in memory at a time.
 */
export const DEFAULT_JOB_CONCURRENCY = 2
export const JOB_CONCURRENCY: { [Q in QueueName]?: number } = {
  'media.process_upload': 1,
}
