import app from '@adonisjs/core/services/app'
import encryption from '@adonisjs/core/services/encryption'
import logger from '@adonisjs/core/services/logger'
import { appUrl } from '#config/app'
import { InvariantViolation } from '#exceptions/programming_errors'
import { tokenEmail, type TokenEmail, type UserTokenPurpose } from '#modules/identity/queries'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { EmailNotSent, EmailSender, type EmailSent } from '#modules/platform/ports/email_sender'
import { jobTx } from '#modules/platform/tx'
import { isEmailTemplate, type EmailTemplate } from '#modules/notifications/domain/email_templates'
import { renderEmail } from '#modules/notifications/internal/render_email'

/*
 * `notifications.send_email` (docs/03 §8.3, §9; docs/04a §14.3; docs/05
 * §8.14; M1 part 1b): sends one `notification_deliveries` row.
 *
 * 1. A short `jobTx` claims the row: `attempts + 1` while it is `queued`
 *    (compare-and-set). A row already `sent` or `failed` matches nothing,
 *    and the job completes without sending, so a replayed or redriven job
 *    never sends twice (T-NOT-101).
 * 2. Outside any transaction, the message is rendered again from the event
 *    and the template, since the body is never stored, and handed to the
 *    `EmailSender` port.
 * 3. A short `jobTx` marks the row `sent` with the provider's message ID,
 *    again only while it is `queued`. A crash between the hand-off and this
 *    step can send one duplicate, which 05 §8.14 accepts for email.
 *
 * Failures (docs/03 §10.4, 04a §14.3, T-NOT-001):
 * - a retryable `EmailNotSent`, or any other error: `last_error` is
 *   recorded, the row stays `queued`, and the error is rethrown so pg-boss
 *   retries; after the last retry the job is dead-lettered, and a redrive
 *   still matches step 1;
 * - a permanent `EmailNotSent` (the provider refused the address): the row
 *   becomes `failed`, which nothing sends again, and the job completes;
 * - a token email whose token can no longer be redeemed, or whose
 *   `token_enc` no longer decrypts (past its expiry, or after an exposure
 *   rotation dropped its key): `failed` without a send, and the job
 *   completes with a warning; the user asks for a new link (docs/07 §3.8
 *   rule 4).
 * `last_error` holds a short reason, never an address (04a §14.3), and log
 * lines hold IDs only (docs/09 §7.2).
 */

// Below the queue's `expireInSeconds` (120 s, docs/03 §9) [Assumption].
const SEND_TIMEOUT_MS = 30_000

// The page that redeems each token (docs/08 §2.3; docs/02 J-04, J-18).
const TOKEN_PAGES: Record<UserTokenPurpose, string> = {
  email_verification: '/verify-email',
  password_reset: '/reset-password',
  mfa_enrollment: '/mfa',
}

export type SendOutcome =
  | { kind: 'sent'; providerMessageId: string }
  | { kind: 'not_queued' }
  | { kind: 'failed'; reason: string }

type SendPayload = JobPayloads['notifications.send_email'] & JobEnvelope
type ClaimedRow = { id: string; template: string; recipient_user_id: string | null }

const LAST_ERROR_MAX = 1000

// A short reason for `last_error`: the port's own, else the error's name, never its message.
function errorReason(error: unknown) {
  if (error instanceof EmailNotSent) return error.reason.slice(0, LAST_ERROR_MAX)
  return error instanceof Error ? error.name.slice(0, LAST_ERROR_MAX) : 'error'
}

// The raw token, or null when `token_enc` no longer decrypts for its purpose.
function decryptToken(tokenEnc: string, purpose: UserTokenPurpose) {
  try {
    const value = encryption.decrypt<unknown>(tokenEnc, `email_token:${purpose}`)
    return typeof value === 'string' && value.length > 0 ? value : null
  } catch {
    return null
  }
}

// APP_URL, the token's page and the token, as the page reads it (`?token=`).
function tokenLink(purpose: UserTokenPurpose, token: string) {
  const url = new URL(TOKEN_PAGES[purpose], appUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

function tokenValues(token: TokenEmail, raw: string) {
  return {
    link: tokenLink(token.purpose, raw),
    minutes: Math.round(token.lifetimeSeconds / 60),
    hours: Math.round(token.lifetimeSeconds / 3600),
  }
}

// Each update matches only a `queued` row, so a row another run finished stays as it is.
function markSent(id: string, providerMessageId: string) {
  return jobTx((trx) =>
    trx.rawQuery(
      `UPDATE notification_deliveries
          SET status = 'sent', sent_at = now(), provider_message_id = ?
        WHERE id = ? AND status = 'queued'`,
      [providerMessageId, id]
    )
  )
}

function markFailed(id: string, reason: string) {
  return jobTx((trx) =>
    trx.rawQuery(
      `UPDATE notification_deliveries SET status = 'failed', last_error = ?
        WHERE id = ? AND status = 'queued'`,
      [reason.slice(0, LAST_ERROR_MAX), id]
    )
  )
}

function recordError(id: string, reason: string) {
  return jobTx((trx) =>
    trx.rawQuery(
      `UPDATE notification_deliveries SET last_error = ?
        WHERE id = ? AND status = 'queued'`,
      [reason, id]
    )
  )
}

function notSent(deliveryId: string, reason: string, requestId: string | null) {
  logger.warn(
    {
      event: 'notifications.email_not_sent',
      queue: 'notifications.send_email',
      delivery_id: deliveryId,
      reason,
      request_id: requestId,
    },
    'email not sent'
  )
}

// Renders and sends, outside any transaction: the port's guard throws inside one (docs/03 §8.3).
async function send(
  template: EmailTemplate,
  deliveryId: string,
  token: TokenEmail,
  raw: string,
  requestId: string | null
) {
  const rendered = await renderEmail(template, tokenValues(token, raw))
  const sender = await app.container.make(EmailSender)
  return sender.send(
    { to: token.email, template, idempotencyKey: deliveryId, ...rendered },
    { requestId, timeoutMs: SEND_TIMEOUT_MS }
  )
}

export async function sendEmail(payload: SendPayload): Promise<SendOutcome> {
  const claim = await jobTx(async (trx) => {
    const claimed = await trx.rawQuery(
      `UPDATE notification_deliveries SET attempts = attempts + 1
        WHERE id = ? AND status = 'queued'
        RETURNING id, template, recipient_user_id`,
      [payload.delivery_id]
    )
    const row: ClaimedRow | undefined = claimed.rows[0]
    if (!row) return null
    return { row, token: await tokenEmail(payload.user_token_id, { client: trx }) }
  })
  if (!claim) return { kind: 'not_queued' }
  const { row, token } = claim
  const template = row.template
  if (!isEmailTemplate(template)) {
    throw new InvariantViolation(`notification_deliveries ${row.id} names an unknown template`)
  }
  if (token && token.userId !== row.recipient_user_id) {
    throw new InvariantViolation(`notification_deliveries ${row.id} and its token name other users`)
  }

  const raw = token?.usable ? decryptToken(payload.token_enc, token.purpose) : null
  if (!token?.usable || raw === null) {
    const reason = token?.usable ? 'token_undecryptable' : 'token_not_usable'
    await markFailed(row.id, reason)
    notSent(row.id, reason, payload.request_id)
    return { kind: 'failed', reason }
  }

  let sent: EmailSent
  try {
    sent = await send(template, row.id, token, raw, payload.request_id)
  } catch (error) {
    if (error instanceof EmailNotSent && error.permanent) {
      await markFailed(row.id, error.reason)
      notSent(row.id, error.reason, payload.request_id)
      return { kind: 'failed', reason: error.reason }
    }
    await recordError(row.id, errorReason(error))
    throw error
  }
  await markSent(row.id, sent.providerMessageId)
  return { kind: 'sent', providerMessageId: sent.providerMessageId }
}
