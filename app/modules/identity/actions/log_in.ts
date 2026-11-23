import { errors as authErrors } from '@adonisjs/auth'
import hash from '@adonisjs/core/services/hash'
import User from '#models/user'
import { DomainError } from '#exceptions/domain_error'
import { auditEmailSubject, recordAudit } from '#modules/audit/actions/record_audit'
import { SIGNED_IN_STATUSES, maySignIn } from '#modules/identity/domain/user_status'
import { throttledLogin } from '#modules/identity/internal/login_throttle'
import { selfActor } from '#modules/identity/internal/self_actor'
import { withTx } from '#modules/platform/tx'
import { ACCOUNT_SUSPENDED_DETAIL, INVALID_CREDENTIALS_DETAIL } from '#shared/constants/auth'

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
 *    compare-and-set on what the check read: a signed-in status and the
 *    same `security_stamp`, and, when a hash made with older scrypt
 *    parameters is replaced (docs/07 §3.7), the same `password_hash`. One
 *    `auth.login` row is written (AC-FR-IAM-003-1) and the stamp goes to
 *    the session. The CAS closes the window between the check and the
 *    write: a password reset or change, or "sign out everywhere", that
 *    rotated the stamp meanwhile must not leave this sign-in holding the
 *    new stamp (which the revoke job spares, docs/07 §3.3), nor have its
 *    new hash overwritten by a rehash of the old password. On a miss the
 *    row is read again: a status that may no longer sign in answers 403 as
 *    step 3 does; anything else (the stamp or the hash changed) answers the
 *    generic 401 of step 4. Either writes one `auth.login_failed` row, and
 *    no session starts.
 * 6. It says whether the account is active staff, because staff go to
 *    `/mfa` next (01 AC-FR-IAM-007-1, 02 J-04 step 6; M1 part 5).
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

// `staff`: an active account with an unrevoked `platform_staff` row, which the caller sends to `/mfa`.
export type LogInResult = { user: User; securityStamp: string; staff: boolean }

// What step 5's transaction found: a sign-in, or why the compare-and-set missed.
type Finish =
  | { kind: 'signed_in'; securityStamp: string; staff: boolean }
  | { kind: 'status'; status: string }
  | { kind: 'changed' }

// The one answer of a wrong password and an unknown email (AC-FR-IAM-003-2).
const invalidCredentials = () =>
  new DomainError('UNAUTHENTICATED', { detail: INVALID_CREDENTIALS_DETAIL })

const accountSuspended = () =>
  new DomainError('ACCOUNT_SUSPENDED', { detail: ACCOUNT_SUSPENDED_DETAIL })

// A right password for an account that may not sign in, carried out of the limiter.
class RefusedStatus extends Error {
  constructor(readonly user: User) {
    super('the account may not sign in')
  }
}

async function recordFailure(
  command: LogInCommand,
  context: LogInContext,
  changes:
    | { cause: 'invalid_credentials' }
    | { cause: 'account_status'; status: string }
    | { cause: 'account_changed' }
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

  const finish = await withTx(async (trx): Promise<Finish> => {
    const cas = trx
      .from('users')
      .where('id', user.id)
      .whereIn('status', [...SIGNED_IN_STATUSES])
      .where('security_stamp', user.securityStamp)
    // A rehash replaces only the hash this check verified.
    if (rehashed) cas.where('password_hash', stored)
    const rows: { security_stamp: string }[] = await cas.update(
      {
        last_login_at: trx.knexRawQuery('now()'),
        ...(rehashed ? { password_hash: rehashed } : {}),
      },
      ['security_stamp']
    )
    const row = rows[0]
    if (!row) {
      const current = await trx.from('users').where('id', user.id).select('status').first()
      if (current && !maySignIn(current.status)) return { kind: 'status', status: current.status }
      return { kind: 'changed' }
    }
    // The actor of the `auth.login` row: staff with their role, anyone else a customer.
    const actor = await selfActor(trx, user.id)
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
    return {
      kind: 'signed_in',
      securityStamp: row.security_stamp,
      staff: actor.actorType === 'platform_staff' && user.status === 'active',
    }
  })

  if (finish.kind === 'status') {
    // Suspended or deactivated between the check and now.
    await recordFailure(command, context, { cause: 'account_status', status: finish.status })
    throw accountSuspended()
  }
  if (finish.kind === 'changed') {
    // The stamp or the hash changed between the check and now: no session for the old one.
    await recordFailure(command, context, { cause: 'account_changed' })
    throw invalidCredentials()
  }
  return { user, securityStamp: finish.securityStamp, staff: finish.staff }
}
