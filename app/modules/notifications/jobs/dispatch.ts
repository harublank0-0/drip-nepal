import logger from '@adonisjs/core/services/logger'
import { hmacKeys } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'
import { tokenEmail, type UserTokenPurpose } from '#modules/identity/queries'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'
import { sendJob, type JobEnvelope, type JobPayloads } from '#modules/platform/jobs'
import { jobTx } from '#modules/platform/tx'
import type { EmailTemplate } from '#modules/notifications/domain/email_templates'
import type { UserTokenIssued } from '#modules/notifications/events'

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
 * keeps only the keyed hash of the address (`HMAC_KEY_NOTIFY_ADDRESS`). A
 * token that can no longer be redeemed (replaced by a newer one, consumed,
 * expired, or its user suspended) gets no row: there is nothing to send,
 * so the job completes with a warning, as a permanent outcome does
 * (docs/03 §10.4). Log lines carry IDs only, never the address or its hash
 * (docs/09 §7.2).
 */

// The template of each token purpose; email verification comes with sign-up (M1 part 2).
export const TOKEN_EMAIL_TEMPLATES: Record<UserTokenPurpose, EmailTemplate | null> = {
  email_verification: null,
  password_reset: 'identity.password_reset',
  mfa_enrollment: 'identity.mfa_enrollment',
}

export type DispatchOutcome =
  | { kind: 'queued'; deliveryId: string }
  | { kind: 'duplicate' }
  | { kind: 'dropped'; reason: 'token_missing' | 'token_not_usable' }

type DispatchPayload = JobPayloads['notifications.dispatch'] & JobEnvelope

export async function dispatchNotification(payload: DispatchPayload): Promise<DispatchOutcome> {
  if (payload.event === 'user_token.issued') return dispatchTokenEmail(payload)
  // A payload from the queue is not checked by the compiler.
  throw new InvariantViolation('notifications.dispatch got an event it has no template for')
}

function dispatchTokenEmail(payload: UserTokenIssued & JobEnvelope): Promise<DispatchOutcome> {
  return jobTx(async (trx) => {
    const token = await tokenEmail(payload.user_token_id, { client: trx })
    if (!token?.usable) {
      const reason = token ? 'token_not_usable' : 'token_missing'
      logger.warn(
        {
          event: 'notifications.email_not_sent',
          queue: 'notifications.dispatch',
          user_token_id: payload.user_token_id,
          reason,
          request_id: payload.request_id,
        },
        'token email not dispatched'
      )
      return { kind: 'dropped', reason } as const
    }
    const template = TOKEN_EMAIL_TEMPLATES[token.purpose]
    if (!template) {
      throw new InvariantViolation(`no email template for ${token.purpose} tokens yet`)
    }

    const inserted = await trx.rawQuery(
      `INSERT INTO notification_deliveries
         (dedupe_key, channel, template, recipient_user_id, to_address_hash)
       VALUES (?, 'email', ?, ?, ?)
       ON CONFLICT (dedupe_key) DO NOTHING
       RETURNING id`,
      [
        `${token.id}:${template}:${token.userId}`,
        template,
        token.userId,
        keyedHash(hmacKeys.notifyAddress.release(), token.email),
      ]
    )
    const row: { id: string } | undefined = inserted.rows[0]
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
