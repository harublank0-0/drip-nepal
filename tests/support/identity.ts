import { randomBytes, randomInt, randomUUID } from 'node:crypto'
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
