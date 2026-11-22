import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto'
import router from '@adonisjs/core/services/router'
import encryption from '@adonisjs/core/services/encryption'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import {
  clientNetwork,
  rateLimitKey,
  rateLimiter,
  type RateLimitName,
} from '#modules/platform/rate_limits'
import type { UserTokenPurpose } from '#modules/identity/domain/user_token_purpose'
import { JOB_SCHEMA } from '#modules/platform/jobs'
import { send } from '#tests/support/courier_http'
import { testBrowser, type Browser } from '#tests/support/browser'
import { queued } from '#tests/support/jobs'

/*
 * Helpers of the sign-up and email-verification tests (docs/06 §13.3; M1
 * part 2a). The test route is registered once, on first import: a guest's
 * first unsafe call needs the session and `XSRF-TOKEN` cookies a page visit
 * gives (docs/07 §3.1), and this route gives them without rendering a page.
 *
 * Limiter keys are committed by the limiter store on its own connection, so
 * each test signs up from its own random client network, sent as
 * `X-Forwarded-For` (loopback is a trusted proxy, config/app.ts), and
 * deletes the keys it made with `forgetKeys` (docs/10 §3.3).
 */

router.get('/__test__/identity/visit', () => ({ ok: true }))

// TEST-NET-2 (RFC 5737), one network per call.
export const randomIPv4 = () => `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`

// One random password per run, never a literal (docs/09 §9.2).
export const SIGN_UP_PASSWORD = randomBytes(12).toString('base64url')

let sequence = 0

// A valid `signUp` body with a fresh address; `overrides` replaces or adds members.
export function signUpBody(prefix: string, overrides: Record<string, unknown> = {}) {
  sequence += 1
  return {
    email: `${prefix}-${sequence}-${randomUUID().slice(0, 8)}@example.com`,
    password: SIGN_UP_PASSWORD,
    full_name: 'Sita Shrestha',
    age_confirmed: true,
    marketing_email_consent: false,
    marketing_sms_consent: false,
    ...overrides,
  }
}

export type Guest = { browser: Browser; ip: string }

// A browser that holds a guest session and its XSRF cookie, on its own client network.
export async function guest(ip = randomIPv4()): Promise<Guest> {
  const browser = testBrowser()
  const response = await browser.request('/__test__/identity/visit')
  await response.text()
  return { browser, ip }
}

// A JSON POST from `client`, with its client network as the forwarded address.
export function postJson(
  client: Guest,
  path: string,
  body: unknown,
  headers: Record<string, string> = {}
) {
  return send(client.browser, 'POST', path, body, { 'X-Forwarded-For': client.ip, ...headers })
}

export const SIGN_UP_PATH = '/api/v1/auth/signup'
export const CONFIRM_PATH = '/api/v1/auth/email-verification/confirm'
export const RESEND_PATH = '/api/v1/auth/email-verification'

export async function userByEmail(email: string) {
  return db.from('users').where('email', email.trim().toLowerCase()).first()
}

// The live token of `purpose` of a user, or null.
export async function liveToken(userId: string, purpose: UserTokenPurpose = 'email_verification') {
  return db.from('user_tokens').where({ user_id: userId, purpose }).whereNull('consumed_at').first()
}

/*
 * The raw token of a `user_tokens` row, as its email would carry it: read
 * from the `notifications.dispatch` job the issuer queued, decrypted for
 * its purpose (docs/07 §3.8 rule 1). Only tests do this.
 */
export async function rawTokenOf(tokenId: string, purpose: UserTokenPurpose) {
  const jobs = await queued<{ user_token_id?: string; token_enc?: string }>(
    'notifications.dispatch'
  )
  const job = jobs.find((queuedJob) => queuedJob.data.user_token_id === tokenId)
  if (!job?.data.token_enc) throw new Error(`no dispatch job for token ${tokenId}`)
  const raw = encryption.decrypt<string>(job.data.token_enc, `email_token:${purpose}`)
  if (!raw) throw new Error(`the dispatch job of token ${tokenId} does not decrypt`)
  return raw
}

// The `notifications.dispatch` jobs whose payload names `userId`, directly or through a token.
export async function dispatchJobsFor(userId: string) {
  const tokens = await db.from('user_tokens').where('user_id', userId).select('id')
  const tokenIds = new Set(tokens.map((token) => token.id as string))
  const jobs = await queued<{ event: string; user_id?: string; user_token_id?: string }>(
    'notifications.dispatch'
  )
  return jobs.filter(
    (job) =>
      job.data.user_id === userId ||
      (job.data.user_token_id !== undefined && tokenIds.has(job.data.user_token_id))
  )
}

export async function forgetKeys(name: RateLimitName, ...parts: string[]) {
  await rateLimiter(name).delete(rateLimitKey(name, ...parts))
}

// The `signup_ip` key of a client network the test used.
export const forgetSignUp = (ip: string) => forgetKeys('signup_ip', clientNetwork(ip))

/*
 * Counts `hash.make` calls while `run` runs (docs/07 TM-09: one scrypt hash
 * on each `signUp` branch). The test server runs in this process, so the
 * count covers HTTP requests too.
 */
export async function countingHashes<T>(run: () => Promise<T>) {
  const own = Object.hasOwn(hash, 'make')
  const original = hash.make
  let calls = 0
  hash.make = async function (this: typeof hash, value: string) {
    calls += 1
    return original.call(this, value)
  }
  try {
    const result = await run()
    return { result, calls }
  } finally {
    if (own) hash.make = original
    else Reflect.deleteProperty(hash, 'make')
  }
}

/*
 * Helpers of the sign-in tests (docs/06 §13.3; M1 part 3). Each test signs
 * in from its own client network and deletes the `login_ip` and
 * `login_acct_ip` keys it made, which the limiter store commits on its own
 * connection (docs/10 §3.3).
 */
export const LOG_IN_PATH = '/api/v1/auth/session'
export const ME_PATH = '/api/v1/me'

// A `DELETE` (`logOut`) from `client`, with its client network as the forwarded address.
export function deleteJson(client: Guest, path: string, headers: Record<string, string> = {}) {
  return send(client.browser, 'DELETE', path, undefined, {
    'X-Forwarded-For': client.ip,
    ...headers,
  })
}

// A `GET` from `client`, with its client network as the forwarded address.
export function getJson(client: Guest, path: string) {
  return send(client.browser, 'GET', path, undefined, { 'X-Forwarded-For': client.ip })
}

// The login limiter keys of one email (as the form sends it, normalised) and client network.
export async function forgetLogin(email: string, ip: string) {
  const network = clientNetwork(ip)
  await forgetKeys('login_acct_ip', email.trim().toLowerCase(), network)
  await forgetKeys('login_ip', network)
}

/*
 * Counts the scrypt hashes `run` spends: `make` and `verify` on the
 * `scrypt` hasher, which `User.verifyCredentials` uses directly (the
 * manager's own `make` is not on its path). The hasher instance is cached
 * by the manager, so patching it covers the test server in this process
 * (docs/07 §3.6, TM-09: one hash on each `logIn` branch).
 */
export async function countingScrypt<T>(run: () => Promise<T>) {
  const scrypt = hash.use('scrypt')
  const make = scrypt.make
  const verify = scrypt.verify
  const counts = { make: 0, verify: 0 }
  scrypt.make = async function (this: typeof scrypt, value: string) {
    counts.make += 1
    return make.call(this, value)
  }
  scrypt.verify = async function (this: typeof scrypt, hashed: string, plain: string) {
    counts.verify += 1
    return verify.call(this, hashed, plain)
  }
  try {
    const result = await run()
    return { result, ...counts }
  } finally {
    Reflect.deleteProperty(scrypt, 'make')
    Reflect.deleteProperty(scrypt, 'verify')
  }
}

/*
 * Helpers of the password reset and change tests (docs/06 §13.3; M1 part
 * 4). `requestPasswordReset` charges `pwreset_ip` and `pwreset_email`, and
 * `changePassword` the two `reauth` keys of the user (and, on a wrong
 * password, `login_acct_ip`); the limiter store commits them on its own
 * connection, so each test deletes the keys it made (docs/10 §3.3).
 */
export const PASSWORD_RESET_PATH = '/api/v1/auth/password-reset'
export const RESET_CONFIRM_PATH = '/api/v1/auth/password-reset/confirm'
export const CHANGE_PASSWORD_PATH = '/api/v1/me/password'
export const REVOKE_ALL_PATH = '/api/v1/me/sessions/revoke-all'

// The `pwreset_email` and `pwreset_ip` keys of one email (normalised) and client network.
export async function forgetPasswordReset(email: string, ip: string) {
  await forgetKeys('pwreset_email', email.trim().toLowerCase())
  await forgetKeys('pwreset_ip', clientNetwork(ip))
}

// The `pwreset_token` key of one raw reset token (keyed on its SHA-256, as `resetPassword` does).
export async function forgetResetToken(token: string) {
  await forgetKeys('pwreset_token', createHash('sha256').update(token).digest('hex'))
}

// The two `reauth` keys of one user.
export async function forgetReauth(userId: string) {
  await forgetKeys('reauth_user', userId)
  await forgetKeys('reauth_user_day', userId)
}

// The `identity.revoke_sessions` jobs queued for `userId`, with their `start_after`.
export async function revokeJobsFor(userId: string) {
  const rows = await db
    .from(`${JOB_SCHEMA}.job`)
    .where('name', 'identity.revoke_sessions')
    .whereIn('state', ['created', 'retry'])
    .whereRaw(`data->>'user_id' = ?`, [userId])
    .select('id', 'data', 'created_on', 'start_after')
  return rows as {
    id: string
    data: { user_id: string; request_id: string | null; causation_id: string | null }
    created_on: Date
    start_after: Date
  }[]
}

// The `notifications.dispatch` jobs of the "password changed" email for `userId`.
export async function passwordChangedJobsFor(userId: string) {
  const jobs = await dispatchJobsFor(userId)
  return jobs.filter((job) => job.data.event === 'user.password_changed')
}

// The `notifications.dispatch` jobs of the "sessions revoked" email for `userId`.
export async function sessionsRevokedJobsFor(userId: string) {
  const jobs = await dispatchJobsFor(userId)
  return jobs.filter((job) => job.data.event === 'user.sessions_revoked')
}
