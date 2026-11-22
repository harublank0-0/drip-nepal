import { randomUUID } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { phoneBlindIndex } from '#modules/platform/crypto/blind_index'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { sendJob } from '#modules/platform/jobs'
import { currentLegalVersions } from '#modules/platform/legal_documents'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * `signUp` (docs/06 §13.3; 01 FR-IAM-001, FR-IAM-013; 02 J-04), the
 * identity entry action. Every caller gets the same answer, whether the
 * email has an account or not, and neither branch signs anyone in (docs/07
 * TM-09, AC-FR-IAM-001-2, RF-38):
 *
 * 1. `signup_ip` takes a point for the client network before anything else,
 *    so a blocked network costs no hash (docs/06 §9.1; 429 past 5 an hour).
 * 2. The password is hashed before the email is looked up, so both branches
 *    spend one scrypt hash (TM-09). The phone, if any, is encrypted with its
 *    blind index and last four digits (docs/04 §2.9).
 * 3. In one transaction, the user is inserted with `ON CONFLICT (email) DO
 *    NOTHING`, whose arbiter is `users_email_key`, the only unique index on
 *    `email`. A concurrent signup for the same email waits for the other
 *    transaction and then inserts nothing, so `users_email_key` never
 *    raises and never becomes an oracle (docs/04a §5.1).
 *    - A new row is `pending_verification` with the column defaults for
 *      `status`, `email_verified_at` and `security_stamp`, `age_confirmed_at`
 *      now and each consent now or null. The step action `issueUserToken`
 *      issues its `email_verification` token and queues the verification
 *      email, and one `user.signup` audit row records the consents by name
 *      and the legal-document versions the page links (AC-FR-IAM-001-6,
 *      AC-FR-IAM-013-4).
 *    - An existing row gets one `notifications.dispatch` job with the event
 *      `user.signup_attempted`, the "account already exists" email
 *      (AC-FR-IAM-001-2); nothing else is written.
 *
 * Each branch queues exactly one email job inside the transaction (ADR-0010).
 */

export type SignUpCommand = {
  // Normalised by the account email rule (trimmed, lower-cased).
  email: string
  password: string
  fullName: string
  // E.164, from the Nepali mobile rule, or null.
  phoneE164: string | null
  marketingEmailConsent: boolean
  marketingSmsConsent: boolean
}

export type SignUpContext = {
  // `request.ip()`, which honours trusted proxies only.
  ip: string
  requestId: string | null
  ipHash: Buffer | null
}

export type SignUpResult = { status: 'verification_email_sent' }

const SIGNED_UP: SignUpResult = { status: 'verification_email_sent' }

function encryptedPhone(e164: string | null) {
  if (!e164) return { enc: null, hash: null, last4: null }
  return {
    enc: encryptField(e164, 'users.phone_enc'),
    hash: phoneBlindIndex(e164),
    last4: e164.slice(-4),
  }
}

export async function signUp(
  command: SignUpCommand,
  context: SignUpContext
): Promise<SignUpResult> {
  await rateLimiter('signup_ip').consume(rateLimitKey('signup_ip', clientNetwork(context.ip)))

  const passwordHash = await hash.make(command.password)
  const phone = encryptedPhone(command.phoneE164)

  await withTx(async (trx) => {
    // ON CONFLICT on `users_email_key` (UNIQUE (email)): an address that already has an
    // account inserts nothing, without aborting the transaction (docs/04a §5.1).
    const now = trx.knexRawQuery('now()')
    const inserted = (await trx
      .knexQuery()
      .table('users')
      .insert({
        email: command.email,
        full_name: command.fullName,
        password_hash: passwordHash,
        phone_enc: phone.enc,
        phone_hash: phone.hash,
        phone_last4: phone.last4,
        age_confirmed_at: now,
        marketing_email_consent_at: command.marketingEmailConsent ? now : null,
        marketing_sms_consent_at: command.marketingSmsConsent ? now : null,
      })
      .onConflict('email')
      .ignore()
      .returning('id')) as { id: string }[]
    const created: { id: string } | undefined = inserted[0]

    if (created) {
      await issueUserToken(trx, created.id, 'email_verification', {
        requestId: context.requestId,
      })
      const granted = ['age_confirmed_at']
      if (command.marketingEmailConsent) granted.push('marketing_email_consent_at')
      if (command.marketingSmsConsent) granted.push('marketing_sms_consent_at')
      await recordAudit(trx, {
        actorType: 'customer',
        actorUserId: created.id,
        action: 'user.signup',
        subjectType: 'user',
        subjectId: created.id,
        requestId: context.requestId,
        ipHash: context.ipHash,
        changes: {
          status: 'pending_verification',
          source: 'signup',
          // Consent columns are Personal (docs/04a §5.1), so they are named, never valued.
          changed: granted,
          legal_document_versions: currentLegalVersions(),
        },
      })
      return
    }

    // The conflicting row has committed (the insert waited for it), so this statement sees it.
    const found = await trx.rawQuery('SELECT id FROM users WHERE email = ?', [command.email])
    const existing: { id: string } | undefined = found.rows[0]
    if (!existing) {
      throw new InvariantViolation('signUp found neither a new nor an existing account')
    }
    const jobId = await sendJob(trx, 'notifications.dispatch', {
      event: 'user.signup_attempted',
      event_id: randomUUID(),
      user_id: existing.id,
      request_id: context.requestId,
      causation_id: null,
    })
    // A standard queue never refuses a send; a null id would mean the email is lost.
    if (!jobId) throw new InvariantViolation('notifications.dispatch refused the signup notice job')
  })

  return SIGNED_UP
}
