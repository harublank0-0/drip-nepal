import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { hmacKeys } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'
import { accountEmail, tokenEmail, type UserTokenPurpose } from '#modules/identity/queries'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'
import { sendJob, type JobEnvelope, type JobPayloads } from '#modules/platform/jobs'
import { jobTx } from '#modules/platform/tx'
import type { EmailTemplate } from '#modules/notifications/domain/email_templates'
import type { AccountNotice, UserTokenIssued } from '#modules/notifications/events'

/*
 * `notifications.dispatch` (docs/03 §9, docs/04a §14.3; M1 part 1b): turns
 * one event into one `notification_deliveries` row per recipient and one
 * `notifications.send_email` job per new row, in one `jobTx`, so the job
 * exists only if its row does (ADR-0010). The row's `dedupe_key` is
 * `<event id>:<template>:<recipient id>` and unique: a replayed event
 * inserts nothing (`ON CONFLICT DO NOTHING`), so it queues no second job
 * and sends no second email (T-NOT-101).
 *
 * `user_token.issued`: the event ID is the token's row ID, the recipient
 * the token's user, and the template follows the token's purpose. The row
 * keeps only the keyed hash of the address (`HMAC_KEY_NOTIFY_ADDRESS`). An
 * event whose row exists is a replay and completes quietly, even after its
 * token was used. Otherwise a token that can no longer be redeemed
 * (replaced by a newer one, consumed, expired, or its user suspended) gets
 * no row: there is nothing to send, so the job completes with a warning,
 * as a permanent outcome does (docs/03 §10.4).
 *
 * The account notices, which carry no token: `user.signup_attempted` (M1
 * part 2a), whose template is `identity.account_exists`,
 * `user.password_changed` and `user.sessions_revoked` (M1 part 4), whose
 * templates are `identity.password_changed` and
 * `identity.sessions_revoked`, and `user.mfa_enabled` (M1 part 5), whose
 * template is `identity.mfa_enabled`. The event ID is the one the sender
 * gave it, and the recipient the account. An account that no longer exists or
 * was anonymised meanwhile gets no row, with a warning. Log lines carry IDs
 * only, never the address or its hash (docs/09 §7.2).
 */

// The template of each token purpose.
export const TOKEN_EMAIL_TEMPLATES: Record<UserTokenPurpose, EmailTemplate> = {
  email_verification: 'identity.email_verification',
  password_reset: 'identity.password_reset',
  mfa_enrollment: 'identity.mfa_enrollment',
}

// The template of each account notice.
export const ACCOUNT_NOTICE_TEMPLATES: Record<AccountNotice['event'], EmailTemplate> = {
  'user.signup_attempted': 'identity.account_exists',
  'user.password_changed': 'identity.password_changed',
  'user.sessions_revoked': 'identity.sessions_revoked',
  'user.mfa_enabled': 'identity.mfa_enabled',
}

// Whether an event from the queue is an account notice (a payload is not checked by the compiler).
export const isAccountNotice = <T extends { event: string }>(
  payload: T
): payload is Extract<T, AccountNotice> => Object.hasOwn(ACCOUNT_NOTICE_TEMPLATES, payload.event)

export type DispatchOutcome =
  | { kind: 'queued'; deliveryId: string }
  | { kind: 'duplicate' }
  | {
      kind: 'dropped'
      reason: 'token_missing' | 'token_not_usable' | 'recipient_missing' | 'recipient_unreachable'
    }

type DispatchPayload = JobPayloads['notifications.dispatch'] & JobEnvelope

export async function dispatchNotification(payload: DispatchPayload): Promise<DispatchOutcome> {
  if (payload.event === 'user_token.issued') return dispatchTokenEmail(payload)
  if (isAccountNotice(payload)) return dispatchAccountNotice(payload)
  // A payload from the queue is not checked by the compiler.
  throw new InvariantViolation('notifications.dispatch got an event it has no template for')
}

// The warning of an event that gives no email; IDs only (docs/09 §7.2).
function notDispatched(ids: Record<string, string>, reason: string, requestId: string | null) {
  logger.warn(
    {
      event: 'notifications.email_not_sent',
      queue: 'notifications.dispatch',
      ...ids,
      reason,
      request_id: requestId,
    },
    'email not dispatched'
  )
}

// A row's existing delivery: a replay of an event already dispatched is quiet.
async function alreadyDispatched(trx: TransactionClientContract, dedupeKey: string) {
  const existing = await trx
    .from('notification_deliveries')
    .where('dedupe_key', dedupeKey)
    .select('id')
    .first()
  return Boolean(existing)
}

// The delivery row, or null when a concurrent replay inserted it first.
async function insertDelivery(
  trx: TransactionClientContract,
  values: { dedupeKey: string; template: EmailTemplate; userId: string; email: string }
) {
  const inserted = await trx.rawQuery(
    `INSERT INTO notification_deliveries
       (dedupe_key, channel, template, recipient_user_id, to_address_hash)
     VALUES (?, 'email', ?, ?, ?)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING id`,
    [
      values.dedupeKey,
      values.template,
      values.userId,
      keyedHash(hmacKeys.notifyAddress.release(), values.email),
    ]
  )
  const row: { id: string } | undefined = inserted.rows[0]
  return row ?? null
}

function dispatchTokenEmail(payload: UserTokenIssued & JobEnvelope): Promise<DispatchOutcome> {
  const ids = { user_token_id: payload.user_token_id }
  return jobTx(async (trx) => {
    const token = await tokenEmail(payload.user_token_id, { client: trx })
    if (!token) {
      notDispatched(ids, 'token_missing', payload.request_id)
      return { kind: 'dropped', reason: 'token_missing' } as const
    }
    const template = TOKEN_EMAIL_TEMPLATES[token.purpose]
    const dedupeKey = `${token.id}:${template}:${token.userId}`

    // A replay of an event already dispatched is quiet, even once its token is spent.
    if (await alreadyDispatched(trx, dedupeKey)) return { kind: 'duplicate' } as const
    if (!token.usable) {
      notDispatched(ids, 'token_not_usable', payload.request_id)
      return { kind: 'dropped', reason: 'token_not_usable' } as const
    }

    const row = await insertDelivery(trx, {
      dedupeKey,
      template,
      userId: token.userId,
      email: token.email,
    })
    if (!row) return { kind: 'duplicate' } as const

    const jobId = await sendJob(trx, 'notifications.send_email', {
      delivery_id: row.id,
      event: payload.event,
      user_token_id: payload.user_token_id,
      token_enc: payload.token_enc,
      request_id: payload.request_id,
      // The cause of the send is the event; its ID is the token's (docs/03 §10.8).
      causation_id: payload.user_token_id,
    })
    // A standard queue never refuses a send; a null ID would lose the email.
    if (!jobId) throw new InvariantViolation('notifications.send_email refused the delivery job')
    return { kind: 'queued', deliveryId: row.id } as const
  })
}

function dispatchAccountNotice(payload: AccountNotice & JobEnvelope): Promise<DispatchOutcome> {
  const ids = { event_id: payload.event_id, user_id: payload.user_id }
  return jobTx(async (trx) => {
    const account = await accountEmail(payload.user_id, { client: trx })
    if (!account) {
      notDispatched(ids, 'recipient_missing', payload.request_id)
      return { kind: 'dropped', reason: 'recipient_missing' } as const
    }
    const template = ACCOUNT_NOTICE_TEMPLATES[payload.event]
    const dedupeKey = `${payload.event_id}:${template}:${account.userId}`

    if (await alreadyDispatched(trx, dedupeKey)) return { kind: 'duplicate' } as const
    if (!account.reachable) {
      notDispatched(ids, 'recipient_unreachable', payload.request_id)
      return { kind: 'dropped', reason: 'recipient_unreachable' } as const
    }

    const row = await insertDelivery(trx, {
      dedupeKey,
      template,
      userId: account.userId,
      email: account.email,
    })
    if (!row) return { kind: 'duplicate' } as const

    // The event's own members, whichever notice it is; its cause is the event (docs/03 §10.8).
    const jobId = await sendJob(trx, 'notifications.send_email', {
      ...payload,
      delivery_id: row.id,
      causation_id: payload.event_id,
    })
    if (!jobId) throw new InvariantViolation('notifications.send_email refused the delivery job')
    return { kind: 'queued', deliveryId: row.id } as const
  })
}
