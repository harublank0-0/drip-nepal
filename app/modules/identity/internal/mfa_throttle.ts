import logger from '@adonisjs/core/services/logger'
import { errors as limiterErrors } from '@adonisjs/limiter'
import { DomainError } from '#exceptions/domain_error'
import { recordAudit } from '#modules/audit/actions/record_audit'
import { selfActor } from '#modules/identity/internal/self_actor'
import { raiseAlert } from '#modules/platform/alerts'
import {
  RATE_LIMITS,
  clientNetwork,
  rateLimitKey,
  rateLimiter,
} from '#modules/platform/rate_limits'
import { withTx } from '#modules/platform/tx'

/*
 * The TOTP limiters of docs/07 §3.9 around one code check, for
 * `verifyMfaChallenge` and `confirmTotpEnrollment` (docs/06 §9.1 `mfa_user`
 * and `mfa`):
 *
 * 1. `mfa_user` counts per account, whatever the session or IP, and `mfa`
 *    per account and client network. Each takes its point with `consume()`
 *    before the check, one atomic upsert in the database store, so however
 *    many codes arrive at once, at most 5 checks run per window. A wrong
 *    code keeps both points; a right one deletes both keys, so only wrong
 *    codes count.
 * 2. After 5 wrong codes in 5 minutes, the next attempt in that window is
 *    refused without being checked, whether its code is right or wrong, as
 *    the `reauth` limiter refuses the attempt after its 5th wrong password:
 *    it takes `mfa_user` past 5 and starts the 15-minute block (OD-50,
 *    decided 2026-11-22). It and every attempt until the block ends get 429
 *    `RATE_LIMITED` with `Retry-After`, in every session and from every IP.
 *    The store blocks only on the point that crosses the limit
 *    (rate-limiter-flexible 9.1.1 `_afterConsume`), and the atomic upsert
 *    gives that point to one request alone, so exactly one
 *    `auth.mfa_locked` audit row (proposed) and one `mfa_lockout` alert are
 *    written per block (docs/11 §9.7).
 * 3. A wrong code (`WrongTotpCode` from the check) writes one
 *    `auth.mfa_failed` audit row (proposed) and answers 422 on `code`.
 *    Any other error (a secret that does not decrypt, a token or enrolment
 *    state that changed meanwhile, a database fault) is not a wrong code:
 *    both points are given back (`decrement`, as `reauthenticate` gives a
 *    right password's back) and the error is rethrown, so data faults never
 *    add up to a block, an `auth.mfa_locked` row or an alert.
 * 4. After a right code has committed, a failed delete of the keys is
 *    logged, never thrown: the keys expire on their own, and a 500 would
 *    hide an enrolment or a check that succeeded.
 *
 * Audit rows are written in their own transaction, because the request
 * fails. They name the user and the client network's hash, never the code.
 */

export type MfaAttemptContext = {
  // `request.ip()`, which honours trusted proxies only.
  ip: string
  requestId: string | null
  ipHash: Buffer | null
}

// Thrown by a check whose code is wrong, replayed or used meanwhile by a concurrent request.
export class WrongTotpCode extends Error {
  constructor() {
    super('the TOTP code does not match')
  }
}

const WRONG_CODE_MESSAGE = "That code didn't work. Enter the code your app shows now."

export function wrongCodeError() {
  return new DomainError('VALIDATION_FAILED', {
    detail: WRONG_CODE_MESSAGE,
    errors: [{ field: 'code', code: 'code_incorrect', message: WRONG_CODE_MESSAGE }],
  })
}

async function audit(
  userId: string,
  action: 'auth.mfa_failed' | 'auth.mfa_locked',
  context: MfaAttemptContext,
  changes: Record<string, string | number> = {}
) {
  await withTx(async (trx) => {
    const actor = await selfActor(trx, userId)
    await recordAudit(trx, {
      ...actor,
      actorUserId: userId,
      action,
      subjectType: 'user',
      subjectId: userId,
      requestId: context.requestId,
      ipHash: context.ipHash,
      changes,
    })
    if (action === 'auth.mfa_locked') {
      raiseAlert('mfa_lockout', { user_id: userId, request_id: context.requestId }, trx)
    }
  })
}

// The 429 of the attempt that started the block: write the lock's audit row and alert once.
async function consumeAccountPoint(userId: string, context: MfaAttemptContext) {
  const account = rateLimiter('mfa_user')
  const key = rateLimitKey('mfa_user', userId)
  try {
    await account.consume(key)
  } catch (error) {
    const crossed =
      error instanceof limiterErrors.E_TOO_MANY_REQUESTS &&
      error.response.consumed === RATE_LIMITS.mfa_user.requests + 1
    if (crossed) await audit(userId, 'auth.mfa_locked', context, { blocked_minutes: 15 })
    throw error
  }
  return { account, key }
}

type Point = { limiter: ReturnType<typeof rateLimiter>; key: string; name: 'mfa_user' | 'mfa' }

/*
 * Gives a point back or deletes a key after the check, never throwing: a
 * failure is logged by the limiter's name only (docs/09 §7.2) and the key
 * expires with its window.
 */
async function settle(points: Point[], how: 'decrement' | 'delete', requestId: string | null) {
  for (const { limiter, key, name } of points) {
    try {
      if (how === 'decrement') await limiter.decrement(key)
      else await limiter.delete(key)
    } catch (error) {
      logger.warn(
        { event: 'limiter.settle_failed', limiter: name, how, request_id: requestId, err: error },
        'a TOTP limiter key was not settled; it expires with its window'
      )
    }
  }
}

export async function throttledTotpCheck<T>(
  userId: string,
  context: MfaAttemptContext,
  check: () => Promise<T>
): Promise<T> {
  const { account, key: accountKey } = await consumeAccountPoint(userId, context)
  const source = rateLimiter('mfa')
  const sourceKey = rateLimitKey('mfa', userId, clientNetwork(context.ip))
  await source.consume(sourceKey)
  const points: Point[] = [
    { limiter: account, key: accountKey, name: 'mfa_user' },
    { limiter: source, key: sourceKey, name: 'mfa' },
  ]

  let result: T
  try {
    result = await check()
  } catch (error) {
    if (!(error instanceof WrongTotpCode)) {
      await settle(points, 'decrement', context.requestId)
      throw error
    }
    await audit(userId, 'auth.mfa_failed', context)
    throw wrongCodeError()
  }
  await settle(points, 'delete', context.requestId)
  return result
}
