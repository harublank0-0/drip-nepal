import { DomainError } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { SIGNED_IN_STATUSES, maySignIn } from '#modules/identity/domain/user_status'
import { encryptedPhone } from '#modules/identity/internal/phone'
import { selfActor } from '#modules/identity/internal/self_actor'
import { withTx } from '#modules/platform/tx'

/*
 * `updateMe` (docs/06 §13.3; 01 FR-IAM-013, AC-FR-IAM-002-2; 02 J-04 step
 * 7; docs/08 §2.4 `/account`), the identity entry action for the signed-in
 * user, `pending_verification` included. Every member is optional; one
 * that is absent keeps its column.
 *
 * - `fullName`: already NFC and within 1–100 code points (the validator).
 * - `phoneE164`: a Nepali mobile in E.164, encrypted with its blind index
 *   and last four digits (docs/04 §2.9, `encryptedPhone`), before the
 *   transaction; null removes the number, all three columns together.
 * - The two marketing consents (AC-FR-IAM-013-1): `true` sets the opt-in
 *   time only where none is held, so a repeated `true` keeps the first
 *   time; `false` clears a held one at once (07 §5.3: withdrawal takes
 *   effect immediately). Each request that grants or withdraws writes one
 *   `user.consent_change` audit row (proposed, docs/04a §15.3) with the
 *   source `account_page` and the columns by name only (AC-FR-IAM-013-4);
 *   a request that changes no consent writes none. The name and the phone
 *   write no audit row: 06 §13.3 audits the consents only, and the row
 *   would hold no value of either.
 *
 * In one transaction the row is locked `FOR NO KEY UPDATE` and read; the
 * write is a compare-and-set on what that read and the account check saw:
 * a signed-in status and the acting session's stamp. A suspension, a
 * deletion request or another device's password change or "sign out
 * everywhere" that committed after the account check is never written over
 * by this stale session: 403 `ACCOUNT_SUSPENDED` if the status changed,
 * else 401 `UNAUTHENTICATED` (docs/07 §3.3), and nothing is written. A
 * request that changes nothing writes nothing. Not ⟳ (`users` has no
 * `version`, docs/06 §8) and not ⚷ (06 §7.7): a repeat sets the same values.
 */

export type UpdateMeCommand = {
  fullName?: string
  // E.164 from the Nepali mobile rule; null removes the number; absent keeps it.
  phoneE164?: string | null
  marketingEmailConsent?: boolean
  marketingSmsConsent?: boolean
  // The `security_stamp` the acting session holds, which the account check has just compared.
  sessionStamp: string
}

export type UpdateMeContext = { requestId: string | null; ipHash: Buffer | null }

const CONSENTS = [
  ['marketingEmailConsent', 'marketing_email_consent_at'],
  ['marketingSmsConsent', 'marketing_sms_consent_at'],
] as const

type LockedUser = {
  status: string
  security_stamp: string
  marketing_email_consent_at: Date | null
  marketing_sms_consent_at: Date | null
}

function staleSession(status: string | undefined) {
  if (status !== undefined && !maySignIn(status)) {
    return new DomainError('ACCOUNT_SUSPENDED', { detail: 'Your account is suspended.' })
  }
  return new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
}

export async function updateMe(
  userId: string,
  command: UpdateMeCommand,
  context: UpdateMeContext
): Promise<void> {
  const phone = command.phoneE164 === undefined ? null : encryptedPhone(command.phoneE164)

  await withTx(async (trx) => {
    const locked = await trx.rawQuery(
      `SELECT status, security_stamp, marketing_email_consent_at, marketing_sms_consent_at
         FROM users WHERE id = ? FOR NO KEY UPDATE`,
      [userId]
    )
    const user: LockedUser | undefined = locked.rows[0]
    if (!user || !maySignIn(user.status) || String(user.security_stamp) !== command.sessionStamp) {
      throw staleSession(user?.status)
    }

    const now = trx.knexRawQuery('now()')
    const values: Record<string, unknown> = {}
    if (command.fullName !== undefined) values.full_name = command.fullName
    if (phone) {
      values.phone_enc = phone.enc
      values.phone_hash = phone.hash
      values.phone_last4 = phone.last4
    }
    const granted: string[] = []
    const withdrawn: string[] = []
    for (const [member, column] of CONSENTS) {
      const wanted = command[member]
      if (wanted === undefined) continue
      const held = user[column] !== null
      if (wanted && !held) {
        values[column] = now
        granted.push(column)
      } else if (!wanted && held) {
        values[column] = null
        withdrawn.push(column)
      }
    }
    if (Object.keys(values).length === 0) return

    const updated: { id: string }[] = await trx
      .from('users')
      .where('id', userId)
      .whereIn('status', [...SIGNED_IN_STATUSES])
      .where('security_stamp', command.sessionStamp)
      .update(values, ['id'])
    // The row is locked and was read as signed in with this stamp, so the update cannot miss.
    if (updated.length === 0) throw staleSession(undefined)

    if (granted.length === 0 && withdrawn.length === 0) return
    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action: 'user.consent_change',
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      // Consent columns are Personal (docs/04a §5.1), so they are named, never valued.
      changes: { source: 'account_page', granted, withdrawn },
    })
  })
}
