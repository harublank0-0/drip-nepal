import { errors as authErrors } from '@adonisjs/auth'
import hash from '@adonisjs/core/services/hash'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import User from '#models/user'
import { DomainError } from '#exceptions/domain_error'
import { auditEmailSubject, recordAudit } from '#modules/audit/actions/record_audit'
import { maySignIn } from '#modules/identity/domain/user_status'
import { throttledLogin } from '#modules/identity/internal/login_throttle'
import { withTx } from '#modules/platform/tx'

/*
 * `logIn` (docs/06 §13.3; 01 FR-IAM-003; 02 J-04 step 5), the identity
 * entry action that checks a password. It never touches the session: the
 * controller starts one with `startSession` from what this returns
 * (docs/07 §3.2, docs/09 §3.4).
 *
 * 1. The login limiters run around the check (`throttledLogin`, docs/07
 *    §3.6): `login_ip` before any credential work, then a `login_acct_ip`
 *    point taken before the check, kept by every refusal and given back by
 *    a sign-in. A refused request (429) is not a login attempt: it reaches
 *    no check and writes no audit row (docs/04a §15.3).
 * 2. `User.verifyCredentials` hashes the submitted password once on both
 *    branches: it verifies against the stored hash, or, for an email with
 *    no account, makes a hash and throws the same error, so an unknown
 *    email costs what a wrong password costs (docs/07 §3.6, TM-09). The
 *    model's `findForAuth` skips anonymised accounts, which therefore take
 *    the unknown-email path.
 * 3. The status is checked before anyone is signed in: a `suspended` or
 *    `deactivated` account with the right password gets 403
 *    `ACCOUNT_SUSPENDED` (AC-FR-IAM-003-4) and keeps its limiter point.
 * 4. A wrong password and an unknown email answer the same 401
 *    `UNAUTHENTICATED` with the same `detail` (AC-FR-IAM-003-2). Each
 *    refusal writes one `auth.login_failed` row in its own transaction,
 *    naming the account when the email matches one and otherwise the
 *    email's keyed hash (docs/04a §15.3). Any other error is rethrown and
 *    reported (RF-12, AC-FR-IAM-003-5).
 * 5. A sign-in, in one transaction: `last_login_at` is set by a
 *    compare-and-set on a signed-in status, which also returns the current
 *    `security_stamp` the session stores; a hash made with older scrypt
 *    parameters is replaced (docs/07 §3.7); and one `auth.login` row is
 *    written (AC-FR-IAM-003-1). A status that changed since the check
 *    answers 403 as step 3 does.
 */

export type LogInCommand = {
  // Normalised by the validator (trimmed, lower-cased).
  email: string
  password: string
}

export type LogInContext = {
  // `request.ip()`, which honours trusted proxies only.
  ip: string
  requestId: string | null
  ipHash: Buffer | null
}

export type LogInResult = { user: User; securityStamp: string }

// The statuses that keep a session, as the CAS of step 5 lists them (docs/07 §3.3 row 1).
const SIGNED_IN = ['pending_verification', 'active']

// The one answer of a wrong password and an unknown email (AC-FR-IAM-003-2).
const invalidCredentials = () =>
  new DomainError('UNAUTHENTICATED', { detail: 'Invalid email or password.' })

const accountSuspended = () =>
  new DomainError('ACCOUNT_SUSPENDED', { detail: 'Your account is suspended.' })

// A right password for an account that may not sign in, carried out of the limiter.
class RefusedStatus extends Error {
  constructor(readonly user: User) {
    super('the account may not sign in')
  }
}

async function recordFailure(
  command: LogInCommand,
  context: LogInContext,
  changes: { cause: 'invalid_credentials' } | { cause: 'account_status'; status: string }
) {
  await withTx(async (trx) => {
    // A row names the account when the email matches one, whatever its status (04a §15.3).
    const found = await trx.from('users').where('email', command.email).select('id').first()
    await recordAudit(trx, {
      actorType: 'customer',
      actorUserId: null,
      action: 'auth.login_failed',
      subjectType: found ? 'user' : 'email_hash',
      subjectId: found ? found.id : auditEmailSubject(command.email),
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes,
    })
  })
}

// The actor of the `auth.login` row: staff with their role, anyone else a customer.
async function loginActor(trx: TransactionClientContract, userId: string) {
  const staff = await trx
    .from('platform_staff')
    .where('user_id', userId)
    .whereNull('revoked_at')
    .select('role')
    .first()
  return staff
    ? { actorType: 'platform_staff' as const, actorRole: `platform:${staff.role}` }
    : { actorType: 'customer' as const, actorRole: null }
}

export async function logIn(command: LogInCommand, context: LogInContext): Promise<LogInResult> {
  let user: User
  try {
    user = await throttledLogin({ email: command.email, ip: context.ip }, async () => {
      const found = await User.verifyCredentials(command.email, command.password)
      if (!maySignIn(found.status)) throw new RefusedStatus(found)
      return found
    })
  } catch (error) {
    if (error instanceof authErrors.E_INVALID_CREDENTIALS) {
      await recordFailure(command, context, { cause: 'invalid_credentials' })
      throw invalidCredentials()
    }
    if (error instanceof RefusedStatus) {
      await recordFailure(command, context, { cause: 'account_status', status: error.user.status })
      throw accountSuspended()
    }
    throw error
  }

  // Hashed before the transaction, so no row lock waits on scrypt.
  // `findForAuth` found the account by a non-null hash.
  const scrypt = hash.use('scrypt')
  const stored = user.passwordHash ?? ''
  const rehashed = scrypt.needsReHash(stored) ? await scrypt.make(command.password) : null

  const securityStamp = await withTx(async (trx) => {
    // Only while the account may still sign in (compare-and-set on the status).
    const rows: { security_stamp: string }[] = await trx
      .from('users')
      .where('id', user.id)
      .whereIn('status', SIGNED_IN)
      .update(
        {
          last_login_at: trx.knexRawQuery('now()'),
          ...(rehashed ? { password_hash: rehashed } : {}),
        },
        ['security_stamp']
      )
    const row = rows[0]
    if (!row) return null
    const actor = await loginActor(trx, user.id)
    await recordAudit(trx, {
      ...actor,
      actorUserId: user.id,
      action: 'auth.login',
      subjectType: 'user',
      subjectId: user.id,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes: rehashed ? { changed: ['password_hash'] } : {},
    })
    return row.security_stamp
  })
  if (securityStamp === null) {
    // Suspended or deactivated between the check and now.
    throw accountSuspended()
  }
  return { user, securityStamp }
}
