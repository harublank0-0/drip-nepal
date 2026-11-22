import { verifyAccount } from '#modules/logistics/jobs/verify_account'
import { syncBranches } from '#modules/logistics/jobs/sync_branches'
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
]
