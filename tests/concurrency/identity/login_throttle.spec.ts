import { test } from '@japa/runner'
import { randomInt, randomUUID } from 'node:crypto'
import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import db from '@adonisjs/lucid/services/db'
import router from '@adonisjs/core/services/router'
import encryption from '@adonisjs/core/services/encryption'
import { CookieClient } from '@adonisjs/core/http'
import { RequestFactory } from '@adonisjs/core/factories/http'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as limiterErrors } from '@adonisjs/limiter'
import env from '#start/env'
import { http } from '#config/app'
import { DomainError } from '#exceptions/domain_error'
import { toProblem } from '#exceptions/to_problem'
import { throttledLogin } from '#modules/identity/internal/login_throttle'
import {
  clientNetwork,
  rateLimitKey,
  rateLimiter,
  type RateLimitName,
} from '#modules/platform/rate_limits'

/*
 * The login limiters of docs/07 §3.6 and docs/06 §9.1 on the database store:
 * - T-SEC-011: the sixth wrong password in a minute for one account and
 *   client network is refused with 429 `RATE_LIMITED` without checking it;
 *   a success clears the key; 20 wrong passwords sent at once reach the
 *   check at most 5 times; `login_ip` refuses the 21st attempt from one
 *   network before any credential work; one IPv6 /64, and an IPv4 address
 *   mapped into IPv6, share a bucket.
 * - T-SEC-101: a 254-character email from an IPv6 address gives a 64-hex
 *   key that the table stores, with no email or address in it; a forged
 *   `X-Forwarded-For` from outside the trusted proxies is ignored.
 *
 * The limiter store commits on its own connection, so these tests are here,
 * each on a fresh random email and network, and delete their keys and the
 * session rows their HTTP requests create (docs/10 §3.3). The credential
 * check here is a stub; `logIn` itself is tested in log_in.spec.ts.
 */

router
  .get('/api/v1/__test__/login-throttle', async ({ request }) => {
    try {
      await throttledLogin({ email: String(request.qs().email), ip: request.ip() }, () => {
        throw new authErrors.E_INVALID_CREDENTIALS('Invalid user credentials')
      })
    } catch (error) {
      // What the logIn action does with a wrong password (AC-FR-IAM-003-2).
      if (error instanceof authErrors.E_INVALID_CREDENTIALS) {
        throw new DomainError('UNAUTHENTICATED', { detail: 'Invalid email or password.' })
      }
      throw error
    }
  })
  .as('loginThrottleProbe')

const baseUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`

const randomEmail = () => `throttle-${randomUUID()}@example.com`
// TEST-NET-2 and the IPv6 documentation prefix (RFC 5737, RFC 3849), one network per call.
const randomIPv4 = () => `198.51.${randomInt(0, 256)}.${randomInt(1, 255)}`
const randomIPv6Network = () =>
  `2001:db8:${randomInt(0, 0xffff).toString(16)}:${randomInt(0, 0xffff).toString(16)}`

const wrongPassword = () => {
  throw new authErrors.E_INVALID_CREDENTIALS('Invalid user credentials')
}

// Deletes the keys a test created, so reruns inside a minute start clean.
async function forget(name: RateLimitName, ...parts: string[]) {
  await rateLimiter(name).delete(rateLimitKey(name, ...parts))
}

async function failures(count: number, attempt: { email: string; ip: string }) {
  for (let i = 0; i < count; i++) {
    await throttledLogin(attempt, wrongPassword).then(
      () => {
        throw new Error('a wrong password passed')
      },
      (error) => {
        if (!(error instanceof authErrors.E_INVALID_CREDENTIALS)) throw error
      }
    )
  }
}

async function refusal(call: () => Promise<unknown>) {
  return call().then(
    () => null,
    (error) => error
  )
}

test.group('T-SEC-011 login throttling', () => {
  test('T-SEC-011 the sixth wrong password in a minute gets 429 without a check [AC-FR-IAM-003-3]', async ({
    assert,
  }) => {
    const attempt = { email: randomEmail(), ip: randomIPv4() }
    await failures(5, attempt)

    let checked = false
    const error = await refusal(() =>
      throttledLogin(attempt, async () => {
        checked = true
        return 'signed in'
      })
    )
    assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
    assert.isFalse(checked, 'the right password is not checked while the key is blocked')

    const problem = toProblem(error, 'req-1')
    assert.equal(problem.status, 429)
    assert.equal(problem.code, 'RATE_LIMITED')
    assert.isAbove(problem.retry_after_seconds!, 0)
    assert.isAtMost(problem.retry_after_seconds!, 60)

    await forget('login_acct_ip', attempt.email, clientNetwork(attempt.ip))
    await forget('login_ip', clientNetwork(attempt.ip))
  })

  test('T-SEC-011 a success clears the account key', async ({ assert }) => {
    const attempt = { email: randomEmail(), ip: randomIPv4() }
    await failures(4, attempt)
    assert.equal(await throttledLogin(attempt, async () => 'signed in'), 'signed in')
    const key = rateLimitKey('login_acct_ip', attempt.email, clientNetwork(attempt.ip))
    assert.isNull(await rateLimiter('login_acct_ip').get(key))
    // Five more wrong passwords are counted from zero again.
    await failures(5, attempt)
    await forget('login_acct_ip', attempt.email, clientNetwork(attempt.ip))
    await forget('login_ip', clientNetwork(attempt.ip))
  })

  test('T-SEC-011 20 wrong passwords at once reach the check at most 5 times', async ({
    assert,
  }) => {
    const attempt = { email: randomEmail(), ip: randomIPv4() }
    let checks = 0
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () =>
        throttledLogin(attempt, async () => {
          checks += 1
          // Hold the check open, as a password hash does, so the attempts overlap.
          await new Promise((resolve) => setTimeout(resolve, 50))
          wrongPassword()
        })
      )
    )
    assert.equal(checks, 5)
    const reasons = results.map((result) => (result.status === 'rejected' ? result.reason : null))
    const wrong = reasons.filter((reason) => reason instanceof authErrors.E_INVALID_CREDENTIALS)
    const limited = reasons.filter((reason) => reason instanceof limiterErrors.E_TOO_MANY_REQUESTS)
    assert.lengthOf(wrong, 5)
    assert.lengthOf(limited, 15)
    await forget('login_acct_ip', attempt.email, clientNetwork(attempt.ip))
    await forget('login_ip', clientNetwork(attempt.ip))
  })

  test('T-SEC-011 login_ip refuses the 21st attempt from one network before any check', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    for (let i = 0; i < 20; i++) {
      await throttledLogin({ email: randomEmail(), ip }, async () => 'signed in')
    }
    let checked = false
    const error = await refusal(() =>
      throttledLogin({ email: randomEmail(), ip }, async () => {
        checked = true
      })
    )
    assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
    assert.isFalse(checked)
    await forget('login_ip', clientNetwork(ip))
  })

  test('T-SEC-011 the addresses of one IPv6 /64 share one bucket', async ({ assert }) => {
    const prefix = `2001:db8:${randomInt(0, 0xffff).toString(16)}`
    const fourth = randomInt(0, 0xfffe)
    const network = `${prefix}:${fourth.toString(16)}`
    const email = randomEmail()
    // Five hosts of the same /64, each with one wrong password.
    for (const host of ['::1', ':ffff:0:0:2', ':abcd:1234:5678:9abc', ':0:0:0:3', '::4']) {
      await failures(1, { email, ip: `${network}${host}` })
    }
    const error = await refusal(() =>
      throttledLogin({ email, ip: `${network}::99` }, async () => 'signed in')
    )
    assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)

    // The neighbouring /64 is another client.
    const neighbour = `${prefix}:${(fourth + 1).toString(16)}::1`
    assert.equal(await throttledLogin({ email, ip: neighbour }, async () => 'ok'), 'ok')

    await forget('login_acct_ip', email, clientNetwork(`${network}::1`))
    await forget('login_ip', clientNetwork(`${network}::1`))
    await forget('login_ip', clientNetwork(neighbour))
  })

  test('T-SEC-011 an IPv4 address mapped into IPv6 and its case-changed email share a bucket', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const email = randomEmail()
    await failures(3, { email, ip })
    await failures(2, { email: ` ${email.toUpperCase()} `, ip: `::ffff:${ip}` })
    const error = await refusal(() => throttledLogin({ email, ip }, async () => 'ok'))
    assert.instanceOf(error, limiterErrors.E_TOO_MANY_REQUESTS)
    await forget('login_acct_ip', email, ip)
    await forget('login_ip', ip)
  })

  test('T-SEC-011 an error other than a wrong password is rethrown unchanged [RF-12]', async ({
    assert,
  }) => {
    const attempt = { email: randomEmail(), ip: randomIPv4() }
    const failure = new Error('connection refused')
    const error = await refusal(() =>
      throttledLogin(attempt, async () => {
        throw failure
      })
    )
    assert.strictEqual(error, failure)
    await forget('login_acct_ip', attempt.email, clientNetwork(attempt.ip))
    await forget('login_ip', clientNetwork(attempt.ip))
  })

  test('T-SEC-011 over HTTP: five 401s, then 429 RATE_LIMITED with Retry-After', async ({
    assert,
  }) => {
    const email = randomEmail()
    const url = `${baseUrl()}/api/v1/__test__/login-throttle?email=${encodeURIComponent(email)}`
    let ip = ''
    const sessionIds: string[] = []
    const cookies = new CookieClient(encryption.use())
    // Each request without a cookie creates a guest session row, which commits here.
    const remember = (response: Response) => {
      for (const cookie of response.headers.getSetCookie()) {
        if (!cookie.startsWith('dripnepal_session=')) continue
        const value = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';')))
        sessionIds.push(cookies.unsign('dripnepal_session', value))
      }
    }
    for (let i = 0; i < 5; i++) {
      const response = await fetch(url)
      remember(response)
      assert.equal(response.status, 401)
      await response.text()
    }
    const limited = await fetch(url)
    remember(limited)
    assert.equal(limited.status, 429)
    const retryAfter = Number(limited.headers.get('retry-after'))
    assert.isAbove(retryAfter, 0)
    assert.isAtMost(retryAfter, 60)
    const problem = (await limited.json()) as Record<string, unknown>
    assert.equal(problem.code, 'RATE_LIMITED')
    assert.equal(problem.retry_after_seconds, retryAfter)

    // The test client is on loopback, IPv4 or IPv6 depending on the host.
    for (const loopback of ['127.0.0.1', '::1']) {
      const key = rateLimitKey('login_acct_ip', email, clientNetwork(loopback))
      if (await rateLimiter('login_acct_ip').get(key)) ip = loopback
    }
    assert.isNotEmpty(ip)
    await forget('login_acct_ip', email, clientNetwork(ip))
    await forget('login_ip', clientNetwork(ip))

    assert.lengthOf(sessionIds, 6)
    await db.from('sessions').whereIn('id', sessionIds).delete()
    assert.lengthOf(await db.from('sessions').whereIn('id', sessionIds), 0)
  })
})

test.group('T-SEC-101 limiter keys and the client address', () => {
  test('T-SEC-101 a 254-character email from IPv6 gives a 64-hex key the table stores', async ({
    assert,
  }) => {
    const local = randomUUID().replaceAll('-', '')
    const email = `${local}${'a'.repeat(254 - local.length - '@example.com'.length)}@example.com`
    assert.lengthOf(email, 254)
    const ip = `${randomIPv6Network()}:1234:5678:9abc:def0`

    const key = rateLimitKey('login_acct_ip', email, clientNetwork(ip))
    assert.match(key, /^login:acct_ip:[0-9a-f]{64}$/)
    assert.match(rateLimitKey('login_ip', clientNetwork(ip)), /^login:ip:[0-9a-f]{64}$/)

    await failures(1, { email, ip })
    // rate-limiter-flexible prefixes the key with `rlflx:`.
    const row = await db.from('rate_limits').where('key', `rlflx:${key}`).firstOrFail()
    assert.equal(row.points, 1)
    assert.isAtMost(row.key.length, 255)
    for (const leak of [local, 'example.com', ip, ip.split(':')[2]]) {
      assert.notInclude(row.key, leak)
    }
    await forget('login_acct_ip', email, clientNetwork(ip))
    await forget('login_ip', clientNetwork(ip))
  })

  test('T-SEC-101 X-Forwarded-For counts only from a trusted proxy', ({ assert }) => {
    const requestFrom = (remoteAddress: string) => {
      const socket = new Socket()
      Object.defineProperty(socket, 'remoteAddress', { value: remoteAddress })
      const req = new IncomingMessage(socket)
      req.headers['x-forwarded-for'] = '192.0.2.77'
      return new RequestFactory().merge({ req, config: { trustProxy: http.trustProxy } }).create()
    }
    // A client on the internet cannot choose its own bucket.
    assert.equal(requestFrom('203.0.113.9').ip(), '203.0.113.9')
    // The local reverse proxy (loopback) is trusted.
    assert.equal(requestFrom('127.0.0.1').ip(), '192.0.2.77')
  })
})
