import { randomBytes } from 'node:crypto'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { maskEmail } from '#modules/identity/domain/mask_email'

/*
 * `BootstrapPlatformAdmin`, the identity entry action behind
 * `node ace platform:create-admin` (docs/09 §9.1, FR-ADM-005; a CLI action,
 * not an HTTP operation). It creates the first `platform_admin`, in one
 * transaction:
 *
 * 1. a transaction-scoped advisory lock serialises concurrent runs, which
 *    on an empty database have no admin row to lock;
 * 2. the unrevoked `platform_admin` rows are locked `FOR UPDATE`, as
 *    `setPlatformStaffRole` locks them (docs/04a §5.4); any one makes the
 *    run refuse (bootstrap only);
 * 3. the account: a new one, `pending_verification` with the hash of 32
 *    random bytes nobody sees (invitation) or `active` and verified with
 *    the password typed at the masked prompt (`--interactive`); or, only
 *    when the operator confirmed it, an existing `active` account, whose
 *    password is never changed and whose `security_stamp` rotates (docs/07
 *    §3.3). A `pending_verification` account is refused: its address is
 *    not proven, so someone could have registered the operator's address
 *    first;
 * 4. the `platform_staff` row with `granted_by` null;
 * 5. a `password_reset` token for an invited new account, and an
 *    `mfa_enrollment` token in every mode (docs/07 §3.9), each with its
 *    queued email;
 * 6. one `platform_staff.bootstrap` audit row by the system, with the role
 *    and the mode, never the email or a token.
 *
 * Verified by T-OPS-019. The `--recover` reset of 11 §14.6 comes with the
 * MFA enrolment path in M1. The transaction is a plain `db.transaction`,
 * because the `withTx` helper of docs/09 §3.8 does not exist yet.
 */

export const BOOTSTRAP_LOCK = 'platform:create-admin'

export type BootstrapMode = 'invitation' | 'interactive' | 'existing_account'

export type BootstrapInput = {
  // Normalised by the shared account email rule.
  email: string
  // Required for a new account; an existing account keeps its name.
  fullName: string | null
  // Null sends an invitation; a string is the `--interactive` password.
  password: string | null
  // True only after the operator confirmed granting the role to an existing account.
  grantExistingAccount: boolean
}

export class AdminAlreadyExists extends Error {
  constructor() {
    super('An unrevoked platform_admin exists')
    this.name = 'AdminAlreadyExists'
  }
}

export class ExistingAccountNeedsConfirmation extends Error {
  constructor() {
    super('The email belongs to an existing account')
    this.name = 'ExistingAccountNeedsConfirmation'
  }
}

export class AccountNotEligible extends Error {
  constructor(status: string) {
    super(`The existing account is ${status}`)
    this.name = 'AccountNotEligible'
  }
}

type ExistingUser = { id: string; status: string }

async function lockAdmins(trx: TransactionClientContract) {
  await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [BOOTSTRAP_LOCK])
  const admins = await trx.rawQuery(
    `SELECT user_id FROM platform_staff
      WHERE role = 'platform_admin' AND revoked_at IS NULL
        FOR UPDATE`
  )
  if (admins.rows.length > 0) throw new AdminAlreadyExists()
}

async function createAccount(
  trx: TransactionClientContract,
  input: BootstrapInput,
  passwordHash: string
) {
  if (!input.fullName) throw new InvariantViolation('a new platform admin needs a full name')
  const interactive = input.password !== null
  const inserted = await trx.rawQuery(
    `INSERT INTO users (email, full_name, password_hash, status, email_verified_at)
     VALUES (?, ?, ?, ?, CASE WHEN ?::boolean THEN now() END)
     RETURNING id`,
    [
      input.email,
      input.fullName,
      passwordHash,
      interactive ? 'active' : 'pending_verification',
      interactive,
    ]
  )
  return inserted.rows[0].id as string
}

async function grantExisting(trx: TransactionClientContract, user: ExistingUser) {
  if (user.status !== 'active') {
    throw new AccountNotEligible(user.status)
  }
  // A staff role grant rotates the stamp, so other sessions sign in again (docs/07 §3.3).
  await trx.rawQuery('UPDATE users SET security_stamp = gen_random_uuid() WHERE id = ?', [user.id])
}

export default class BootstrapPlatformAdmin {
  async execute(input: BootstrapInput) {
    // Hashing is slow, so it runs before any lock is taken, and only for a new account.
    const newPasswordHash = () => hash.make(input.password ?? randomBytes(32).toString('base64url'))
    const passwordHash = input.grantExistingAccount ? null : await newPasswordHash()

    // eslint-disable-next-line no-restricted-syntax -- withTx (docs/09 §3.8) does not exist yet; see the header
    return db.transaction(async (trx) => {
      await lockAdmins(trx)

      const found = await trx.rawQuery(
        'SELECT id, status FROM users WHERE email = ? FOR NO KEY UPDATE',
        [input.email]
      )
      const existing: ExistingUser | undefined = found.rows[0]
      let userId: string
      let mode: BootstrapMode
      if (existing) {
        if (!input.grantExistingAccount) throw new ExistingAccountNeedsConfirmation()
        await grantExisting(trx, existing)
        userId = existing.id
        mode = 'existing_account'
      } else {
        // Users are never deleted, so a confirmed existing account cannot vanish; hash anyway if it did.
        userId = await createAccount(trx, input, passwordHash ?? (await newPasswordHash()))
        mode = input.password === null ? 'invitation' : 'interactive'
      }

      // A revoked or other-role row of an existing account becomes the grant.
      await trx.rawQuery(
        `INSERT INTO platform_staff (user_id, role, granted_by)
         VALUES (?, 'platform_admin', NULL)
         ON CONFLICT (user_id) DO UPDATE
           SET role = 'platform_admin', granted_by = NULL, granted_at = now(),
               revoked_at = NULL, revoked_by = NULL`,
        [userId]
      )

      const tokens = []
      if (mode === 'invitation') tokens.push(await issueUserToken(trx, userId, 'password_reset'))
      tokens.push(await issueUserToken(trx, userId, 'mfa_enrollment'))

      await recordAudit(trx, {
        actorType: 'system',
        action: 'platform_staff.bootstrap',
        subjectType: 'user',
        subjectId: userId,
        changes: { role: 'platform_admin', mode },
      })

      return {
        userId,
        mode,
        maskedEmail: maskEmail(input.email),
        tokens: tokens.map(({ purpose, lifetimeSeconds }) => ({ purpose, lifetimeSeconds })),
      }
    })
  }
}
