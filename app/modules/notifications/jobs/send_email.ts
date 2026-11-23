import app from '@adonisjs/core/services/app'
import encryption from '@adonisjs/core/services/encryption'
import logger from '@adonisjs/core/services/logger'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { appUrl } from '#config/app'
import { hmacKeys } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'
import {
  accountEmail,
  tokenEmail,
  type AccountEmail,
  type TokenEmail,
  type UserTokenPurpose,
} from '#modules/identity/queries'
import { keyedHash } from '#modules/platform/crypto/keyed_hash'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { EmailNotSent, EmailSender, type EmailSent } from '#modules/platform/ports/email_sender'
import { jobTx } from '#modules/platform/tx'
import { isEmailTemplate, type EmailTemplate } from '#modules/notifications/domain/email_templates'
import { renderEmail } from '#modules/notifications/internal/render_email'
import { isAccountNotice } from '#modules/notifications/jobs/dispatch'

/*
 * `notifications.send_email` (docs/03 §8.3, §9; docs/04a §14.3; docs/05
 * §8.14; M1 part 1b): sends one `notification_deliveries` row.
 *
 * 1. A short `jobTx` claims the row: `attempts + 1` while it is `queued`
 *    (compare-and-set). A row already `sent` or `failed` matches nothing,
 *    and the job completes quietly without sending, so a replayed or
 *    redriven job never sends twice (T-NOT-101). A row that does not exist
 *    completes the job with a warning (03 §10.4).
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
 *   rule 4);
 * - an address that is no longer the one dispatch hashed into
 *   `to_address_hash`: `failed` with `address_changed` and no send, so the
 *   row never claims a send to an address it does not record (04a §14.3);
 * - an account notice (`user.signup_attempted`, M1 part 2a,
 *   `user.password_changed` and `user.sessions_revoked`, M1 part 4, or
 *   `user.mfa_enabled`, M1 part 5) of an
 *   account that is gone or was anonymised meanwhile: `failed` with
 *   `recipient_unreachable` and no send.
 * `last_error` holds short reasons, never an address (04a §14.3): a final
 * reason is appended to the transport error before it, within 1,000
 * characters. Log lines hold IDs only (docs/09 §7.2).
 */

// Below the queue's `expireInSeconds` (120 s, docs/03 §9) [Assumption].
const SEND_TIMEOUT_MS = 30_000

// The page that redeems each token (docs/08 §2.3; docs/02 J-04, J-18).
const TOKEN_PAGES: Record<UserTokenPurpose, string> = {
  email_verification: '/verify-email',
  password_reset: '/reset-password',
  mfa_enrollment: '/mfa',
}

/*
 * The page each account notice links (docs/08 §2.3): sign-in for "account
 * already exists", and the reset request for "your password was changed",
 * "sessions revoked" and "two-step verification turned on", for a holder
 * who did not make the change.
 */
const NOTICE_PAGES: Partial<Record<EmailTemplate, string>> = {
  'identity.account_exists': '/login',
  'identity.password_changed': '/forgot-password',
  'identity.sessions_revoked': '/forgot-password',
  'identity.mfa_enabled': '/forgot-password',
}

export type SendOutcome =
  | { kind: 'sent'; providerMessageId: string }
  | { kind: 'not_queued' }
  | { kind: 'missing' }
  | { kind: 'failed'; reason: string }

type SendPayload = JobPayloads['notifications.send_email'] & JobEnvelope
type TokenSend = Extract<SendPayload, { event: 'user_token.issued' }>

// What the claim read about the recipient, in the claim's transaction.
type Recipient =
  | { kind: 'token'; token: TokenEmail | null }
  | { kind: 'account'; account: AccountEmail | null }

type ClaimedRow = {
  id: string
  template: string
  recipient_user_id: string | null
  to_address_hash: Buffer | null
}

const LAST_ERROR_MAX = 1000
// A final reason is a short code; the earlier `last_error` keeps the rest of the 1,000.
const FINAL_REASON_MAX = 200

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

/*
 * `failed` with its final reason after any earlier one ("timeout;
 * token_not_usable"), so a transport error recorded during an outage is
 * kept; the earlier part is cut to stay within 1,000 characters.
 */
function markFailed(id: string, reason: string) {
  const final = reason.slice(0, FINAL_REASON_MAX)
  return jobTx((trx) =>
    trx.rawQuery(
      `UPDATE notification_deliveries
          SET status = 'failed',
              last_error = CASE
                WHEN last_error IS NULL OR last_error = '' THEN ?::text
                ELSE left(last_error, ?::int) || '; ' || ?::text
              END
        WHERE id = ? AND status = 'queued'`,
      [final, LAST_ERROR_MAX - 2 - final.length, final, id]
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

// Whether `email` is the address dispatch hashed into the row (docs/04a §14.3).
function sameAddress(email: string, hash: Buffer | null) {
  return hash !== null && keyedHash(hmacKeys.notifyAddress.release(), email).equals(hash)
}

// The recipient of an event, read inside the claim's transaction.
async function readRecipient(
  payload: SendPayload,
  client: TransactionClientContract
): Promise<Recipient> {
  if (payload.event === 'user_token.issued') {
    return { kind: 'token', token: await tokenEmail(payload.user_token_id, { client }) }
  }
  if (isAccountNotice(payload)) {
    return { kind: 'account', account: await accountEmail(payload.user_id, { client }) }
  }
  // A payload from the queue is not checked by the compiler.
  throw new InvariantViolation('notifications.send_email got an event it has no template for')
}

// The row and its recipient must name one user; anything else is a bug.
function assertSameRecipient(row: ClaimedRow, recipient: Recipient) {
  const userId = recipient.kind === 'token' ? recipient.token?.userId : recipient.account?.userId
  if (userId !== undefined && userId !== row.recipient_user_id) {
    throw new InvariantViolation(`notification_deliveries ${row.id} and its event name other users`)
  }
}

type Ready = { to: string; values: Record<string, string | number> }

// The token email to send, or why it can no longer be sent.
function tokenSendable(
  row: ClaimedRow,
  token: TokenEmail | null,
  payload: TokenSend
): Ready | { reason: string } {
  if (!token?.usable) return { reason: 'token_not_usable' }
  if (!sameAddress(token.email, row.to_address_hash)) return { reason: 'address_changed' }
  const raw = decryptToken(payload.token_enc, token.purpose)
  return raw === null
    ? { reason: 'token_undecryptable' }
    : { to: token.email, values: tokenValues(token, raw) }
}

// An account notice to send, or why it can no longer be sent.
function accountSendable(
  row: ClaimedRow,
  account: AccountEmail | null,
  template: EmailTemplate
): Ready | { reason: string } {
  const page = NOTICE_PAGES[template]
  if (!page) throw new InvariantViolation(`${template} is not an account notice`)
  if (!account?.reachable) return { reason: 'recipient_unreachable' }
  if (!sameAddress(account.email, row.to_address_hash)) return { reason: 'address_changed' }
  return { to: account.email, values: { link: new URL(page, appUrl).toString() } }
}

function sendable(
  row: ClaimedRow,
  recipient: Recipient,
  payload: SendPayload,
  template: EmailTemplate
): Ready | { reason: string } {
  if (recipient.kind === 'token' && payload.event === 'user_token.issued') {
    return tokenSendable(row, recipient.token, payload)
  }
  if (recipient.kind === 'account') return accountSendable(row, recipient.account, template)
  throw new InvariantViolation('notifications.send_email read a recipient of another event')
}

// Renders and sends, outside any transaction: the port's guard throws inside one (docs/03 §8.3).
async function send(
  template: EmailTemplate,
  deliveryId: string,
  ready: Ready,
  requestId: string | null
) {
  const rendered = await renderEmail(template, ready.values)
  const sender = await app.container.make(EmailSender)
  return sender.send(
    { to: ready.to, template, idempotencyKey: deliveryId, ...rendered },
    { requestId, timeoutMs: SEND_TIMEOUT_MS }
  )
}

export async function sendEmail(payload: SendPayload): Promise<SendOutcome> {
  const claim = await jobTx(async (trx) => {
    const claimed = await trx.rawQuery(
      `UPDATE notification_deliveries SET attempts = attempts + 1
        WHERE id = ? AND status = 'queued'
        RETURNING id, template, recipient_user_id, to_address_hash`,
      [payload.delivery_id]
    )
    const row: ClaimedRow | undefined = claimed.rows[0]
    if (row) return { row, recipient: await readRecipient(payload, trx) }
    const found = await trx
      .from('notification_deliveries')
      .where('id', payload.delivery_id)
      .select('id')
      .first()
    return found ? ('not_queued' as const) : ('missing' as const)
  })
  // Already sent or failed by another run: nothing to do.
  if (claim === 'not_queued') return { kind: 'not_queued' }
  if (claim === 'missing') {
    notSent(payload.delivery_id, 'delivery_missing', payload.request_id)
    return { kind: 'missing' }
  }
  const { row, recipient } = claim
  const template = row.template
  if (!isEmailTemplate(template)) {
    throw new InvariantViolation(`notification_deliveries ${row.id} names an unknown template`)
  }
  assertSameRecipient(row, recipient)

  const ready = sendable(row, recipient, payload, template)
  if ('reason' in ready) {
    await markFailed(row.id, ready.reason)
    notSent(row.id, ready.reason, payload.request_id)
    return { kind: 'failed', reason: ready.reason }
  }

  let sent: EmailSent
  try {
    sent = await send(template, row.id, ready, payload.request_id)
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
