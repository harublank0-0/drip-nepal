import { test } from '@japa/runner'
import { gzipSync } from 'node:zlib'
import vine from '@vinejs/vine'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import { Logger } from '@adonisjs/core/logger'
import { LimiterResponse, errors as limiterErrors } from '@adonisjs/limiter'
import env from '#start/env'
import { middleware } from '#start/kernel'
import { DomainError } from '#exceptions/domain_error'
import { ProviderUnavailableError } from '#exceptions/provider_errors'
import { hmacKeys } from '#config/crypto'
import { ipHash, keyedHash } from '#modules/platform/crypto/keyed_hash'
import pg from 'pg'
import { parseInt8 } from '#start/database_types'

/*
 * The error contract and request IDs over HTTP (docs/06 §5, §11; docs/09
 * §5.4, §7.4):
 * - T-API-005: `X-Request-Id` is echoed and equals `problem.request_id`; an
 *   invalid incoming ID is replaced; `Retry-After` on 429, 409
 *   `IDEMPOTENCY_IN_PROGRESS` and a provider-outage 503, never on the
 *   kill-switch 503.
 * - T-SEC-027 (the ADR-0018 RF-36 test): a unique violation off the allowlist
 *   answers 500 `INTERNAL` with no SQL, constraint or stack, and the log line
 *   carries the full error under the same request ID. The test environment
 *   takes the production rendering path (`debug` is on in development only).
 * - The page path: 404 and 5xx status pages, the request ID on the error
 *   screen, and problem+json for a page URL asked for JSON.
 *
 * The routes below exist only in this test run, under `__test__` paths.
 * A failing statement runs in a transaction, as an action's does: inside the
 * test's global transaction it is a savepoint, so the session store can
 * still write the session afterwards.
 */

router
  .group(() => {
    router.get('unique-violation', async () => {
      // `platform_settings_pkey` is not on the constraint allowlist.
      const key = 'checkout_enabled'
      await db.transaction((trx) =>
        trx.rawQuery(
          `INSERT INTO platform_settings (key, value) VALUES (?, 'true'::jsonb), (?, 'true'::jsonb)`,
          [key, key]
        )
      )
    })
    router.get('rate-limited', () => {
      throw new limiterErrors.E_TOO_MANY_REQUESTS(
        new LimiterResponse({ limit: 5, remaining: 0, consumed: 6, availableIn: 37 })
      )
    })
    router.get('in-progress', () => {
      throw new DomainError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 2 })
    })
    router.get('provider-down', () => {
      throw new ProviderUnavailableError('khalti', 'initiate')
    })
    router.get('kill-switch', () => {
      throw new DomainError('PROVIDER_UNAVAILABLE', { detail: 'Checkout is paused.' })
    })
    router.get('bad-uuid', async () => {
      // SQLSTATE 22P02, whose server message quotes the value.
      await db.transaction((trx) => trx.rawQuery('SELECT ?::uuid', ['ram@example.com']))
    })
    router.post('echo', ({ request }) => request.body())
    router.post('protected', () => 'ok').use(middleware.auth())
  })
  .prefix('/api/v1/__test__')

router
  .group(() => {
    router.get('page-boom', async () => {
      await db.transaction((trx) => trx.rawQuery('SELECT 1 / 0'))
    })
    // An error from a library that sets its own `status`, with a message that must not show.
    router.get('foreign-status/:status', ({ params }) => {
      throw Object.assign(new Error('SECRET select * from users'), {
        status: Number(params.status),
      })
    })
    router.get('missing-row', async () => {
      await db.from('platform_settings').where('key', 'no_such_key').firstOrFail()
    })
    router.get('needs-login', () => {
      throw new DomainError('UNAUTHENTICATED')
    })
    router.get('page-validation', async ({ request }) => {
      await vine
        .compile(vine.object({ page: vine.number().min(1) }))
        .validate(request.qs(), { meta: {} })
    })
  })
  .prefix('/__test__')

const baseUrl = () => `http://${env.get('HOST')}:${env.get('PORT')}`

type LogLine = {
  level: string
  fields: Record<string, unknown>
  message: string
  request_id: unknown
}

// Every line written through an Adonis Logger while `run` runs.
async function captureLogs(run: () => Promise<void>) {
  const lines: LogLine[] = []
  const original = Logger.prototype.log
  Logger.prototype.log = function (this: Logger, level, fields, message, ...values) {
    lines.push({
      level,
      fields: (fields ?? {}) as Record<string, unknown>,
      message: String(message),
      request_id: (this.bindings() as Record<string, unknown>).request_id,
    })
    return original.call(this, level, fields, message, ...values)
  } as Logger['log']
  try {
    await run()
  } finally {
    Logger.prototype.log = original
  }
  return lines
}

async function problemOf(response: Response) {
  return (await response.json()) as Record<string, unknown>
}

test.group('T-API-005 request IDs and Retry-After', () => {
  test('a valid incoming X-Request-Id is echoed and is the body request_id', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/__test__/in-progress`, {
      headers: { 'X-Request-Id': 'client-trace-0001' },
    })
    assert.equal(response.headers.get('x-request-id'), 'client-trace-0001')
    const problem = await problemOf(response)
    assert.equal(problem.request_id, 'client-trace-0001')
  })

  test('an invalid incoming ID ({name}) is replaced by a fresh UUID')
    .with([
      { name: 'too short', id: 'abc' },
      { name: 'bad characters', id: 'trace id\nforged=1' },
      { name: 'too long', id: 'a'.repeat(65) },
    ])
    .run(async ({ assert }, { id }) => {
      let echoedId: string | null = null
      const lines = await captureLogs(async () => {
        const response = await fetch(`${baseUrl()}/api/v1/nothing-here`, {
          headers: { 'X-Request-Id': id.replace('\n', ' ') },
        })
        const echoed = response.headers.get('x-request-id')
        echoedId = echoed
        assert.match(echoed ?? '', /^[0-9a-f-]{36}$/)
        const problem = await problemOf(response)
        assert.equal(problem.request_id, echoed)
      })
      // The log lines carry the replacement, never the client's value.
      assert.isNotEmpty(lines)
      for (const line of lines) assert.equal(line.request_id, echoedId)
    })

  test('without an incoming ID one is generated and echoed', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/nothing-here`)
    const echoed = response.headers.get('x-request-id')
    assert.match(echoed ?? '', /^[A-Za-z0-9-]{8,64}$/)
    const problem = await problemOf(response)
    assert.equal(problem.request_id, echoed)
  })

  test('Retry-After on {path} is {seconds}')
    .with([
      { path: 'rate-limited', status: 429, code: 'RATE_LIMITED', seconds: '37' },
      { path: 'in-progress', status: 409, code: 'IDEMPOTENCY_IN_PROGRESS', seconds: '2' },
      { path: 'provider-down', status: 503, code: 'PROVIDER_UNAVAILABLE', seconds: '30' },
    ])
    .run(async ({ assert }, { path, status, code, seconds }) => {
      const response = await fetch(`${baseUrl()}/api/v1/__test__/${path}`)
      assert.equal(response.status, status)
      assert.equal(response.headers.get('retry-after'), seconds)
      const problem = await problemOf(response)
      assert.equal(problem.code, code)
      assert.equal(problem.retry_after_seconds, Number(seconds))
    })

  test('the kill-switch 503 has no Retry-After', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/__test__/kill-switch`)
    assert.equal(response.status, 503)
    assert.isNull(response.headers.get('retry-after'))
    const problem = await problemOf(response)
    assert.equal(problem.detail, 'Checkout is paused.')
    assert.notProperty(problem, 'retry_after_seconds')
  })
})

test.group('Error contract over HTTP', () => {
  test('API errors are problem+json and never cached', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/nothing-here`)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('content-type'), 'application/problem+json; charset=utf-8')
    assert.equal(response.headers.get('cache-control'), 'no-store')
    const problem = await problemOf(response)
    assert.containsSubset(problem, {
      type: 'https://dripnepal.com/problems/not-found',
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  test('an unparseable JSON body is 422 malformed_json', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/__test__/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"email": ram@example.com',
    })
    assert.equal(response.status, 422)
    const problem = await problemOf(response)
    assert.equal(problem.code, 'VALIDATION_FAILED')
    assert.deepEqual(problem.errors, [
      { field: null, code: 'malformed_json', message: 'The request body is not valid JSON.' },
    ])
  })

  test('a CSRF failure is 403, and 401 on a signed-in route with no session', async ({
    assert,
  }) => {
    const post = (path: string) =>
      fetch(`${baseUrl()}/api/v1/__test__/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    const guest = await post('echo')
    assert.equal(guest.status, 403)
    const forbidden = await problemOf(guest)
    assert.equal(forbidden.code, 'FORBIDDEN')
    const signedIn = await post('protected')
    assert.equal(signedIn.status, 401)
    const unauthenticated = await problemOf(signedIn)
    assert.equal(unauthenticated.code, 'UNAUTHENTICATED')
  })
})

test.group('http.error log levels', () => {
  test('{path} logs one http.error line at {level}')
    .with([
      { path: 'api/v1/nothing-here', level: 'info', code: 'NOT_FOUND' },
      { path: 'api/v1/__test__/provider-down', level: 'warn', code: 'PROVIDER_UNAVAILABLE' },
      { path: 'api/v1/__test__/kill-switch', level: 'warn', code: 'PROVIDER_UNAVAILABLE' },
      { path: 'api/v1/__test__/unique-violation', level: 'error', code: 'INTERNAL' },
    ])
    .run(async ({ assert }, { path, level, code }) => {
      const lines = await captureLogs(async () => {
        await fetch(`${baseUrl()}/${path}`).then((response) => response.text())
      })
      const errorLines = lines.filter((line) => line.message === 'http.error')
      assert.lengthOf(errorLines, 1)
      assert.equal(errorLines[0].level, level)
      assert.equal(errorLines[0].fields.problem_code, code)
      // Only an `error` line carries the error itself.
      assert.equal('err' in errorLines[0].fields, level === 'error')
    })
})

test.group('T-SEC-027 no SQL or stack in production errors', () => {
  test('a unique violation off the allowlist is 500 INTERNAL; the log has the error', async ({
    assert,
  }) => {
    let requestId: string | null = null
    let body = ''
    const lines = await captureLogs(async () => {
      const response = await fetch(`${baseUrl()}/api/v1/__test__/unique-violation`)
      assert.equal(response.status, 500)
      requestId = response.headers.get('x-request-id')
      body = await response.text()
    })

    const problem = JSON.parse(body)
    assert.deepEqual(problem, {
      type: 'https://dripnepal.com/problems/internal',
      title: 'Something went wrong',
      status: 500,
      detail: 'Something went wrong. Quote the request ID to support.',
      code: 'INTERNAL',
      request_id: requestId,
    })
    for (const leak of ['platform_settings', 'INSERT', 'duplicate', 'pkey', '23505', 'at ']) {
      assert.notInclude(body, leak)
    }

    const errorLine = lines.find((line) => line.message === 'http.error')
    assert.isDefined(errorLine)
    assert.equal(errorLine!.level, 'error')
    assert.equal(errorLine!.request_id, requestId)
    assert.containsSubset(errorLine!.fields, {
      problem_code: 'INTERNAL',
      status: 500,
      sqlstate: '23505',
    })
    // Not a data exception: logged in full. PostgreSQL's message names the
    // constraint; Knex's SQL has numbered placeholders, not values.
    const logged = errorLine!.fields.err as Error & { constraint: string }
    assert.instanceOf(logged, Error)
    assert.equal(logged.constraint, 'platform_settings_pkey')
    assert.include(logged.message, '$1')
    assert.include(logged.message, 'platform_settings_pkey')
    assert.notInclude(logged.message, "'checkout_enabled'")

    const accessLine = lines.find((line) => line.message === 'http.request')
    assert.containsSubset(accessLine?.fields, {
      method: 'GET',
      route: '/api/v1/__test__/unique-violation',
      status: 500,
    })
    assert.equal(accessLine!.request_id, requestId)
  })
})

test.group('Error pages', () => {
  test('an unknown page renders errors/not_found with 404', async ({ assert }) => {
    const lines = await captureLogs(async () => {
      const response = await fetch(`${baseUrl()}/no-such-page/secret-token-123`)
      assert.equal(response.status, 404)
      assert.include(await response.text(), 'find that page')
    })
    const accessLine = lines.find((line) => line.message === 'http.request')
    // No route: the pattern is null and the raw URL, with its token, is not logged.
    assert.containsSubset(accessLine?.fields, { route: null, status: 404 })
    assert.notInclude(JSON.stringify(lines.map((line) => line.fields)), 'secret-token-123')
  })

  test('a failing page renders errors/server_error with the request ID only', async ({
    assert,
  }) => {
    const response = await fetch(`${baseUrl()}/__test__/page-boom`, {
      headers: { 'X-Request-Id': 'page-trace-0001' },
    })
    assert.equal(response.status, 500)
    const html = await response.text()
    assert.include(html, 'Sorry, something went wrong')
    assert.include(html, 'page-trace-0001')
    for (const leak of ['division by zero', 'SELECT 1', '22012']) assert.notInclude(html, leak)
  })

  test('a page URL asked for JSON answers problem+json, not the message', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/__test__/page-boom`, {
      headers: { Accept: 'application/json' },
    })
    assert.equal(response.status, 500)
    const body = await response.text()
    assert.equal(JSON.parse(body).code, 'INTERNAL')
    assert.notInclude(body, 'division by zero')
  })
})

test.group('Pages answer from the problem, never from error.status', () => {
  test('an error with its own status {status} answers {expected} without its message')
    .with([
      { status: 600, expected: 500 },
      { status: 403, expected: 500 },
      { status: 302, expected: 500 },
      { status: 404, expected: 500 },
    ])
    .run(async ({ assert }, { status, expected }) => {
      const response = await fetch(`${baseUrl()}/__test__/foreign-status/${status}`, {
        redirect: 'manual',
      })
      assert.equal(response.status, expected)
      const html = await response.text()
      assert.include(html, 'Sorry, something went wrong')
      assert.notInclude(html, 'SECRET')
    })

  test("Lucid's firstOrFail on a missing row renders errors/not_found", async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/__test__/missing-row`)
    assert.equal(response.status, 404)
    assert.include(await response.text(), 'find that page')
  })

  test('a page needing a sign-in redirects with the URL only as return_to', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/__test__/needs-login?token=abc123&page=2`, {
      redirect: 'manual',
    })
    assert.equal(response.status, 302)
    const location = new URL(response.headers.get('location')!, baseUrl())
    assert.equal(location.pathname, '/login')
    assert.deepEqual([...location.searchParams.keys()], ['return_to'])
    assert.equal(
      location.searchParams.get('return_to'),
      '/__test__/needs-login?token=abc123&page=2'
    )
  })

  test('a validation error on a page URL asked for JSON is problem+json without meta', async ({
    assert,
  }) => {
    const response = await fetch(`${baseUrl()}/__test__/page-validation?page=0`, {
      headers: { Accept: 'application/json' },
    })
    assert.equal(response.status, 422)
    assert.equal(response.headers.get('content-type'), 'application/problem+json; charset=utf-8')
    const problem = await problemOf(response)
    assert.equal(problem.code, 'VALIDATION_FAILED')
    assert.deepEqual(
      (problem.errors as { field: string; code: string }[]).map(({ field, code }) => ({
        field,
        code,
      })),
      [{ field: 'page', code: 'min' }]
    )
    assert.notInclude(JSON.stringify(problem), 'meta')
  })
})

test.group('Unreadable bodies are 422, not 500', () => {
  test('{name} is 422 {item} at info')
    .with([
      {
        name: 'an unknown Content-Encoding',
        item: 'unsupported_media_type',
        headers: { 'Content-Encoding': 'bogus' },
        body: () => '{}',
      },
      {
        name: 'a gzip body that does not decompress',
        item: 'malformed_body',
        headers: { 'Content-Encoding': 'gzip' },
        body: () => '{"not": "gzip"}',
      },
    ])
    .run(async ({ assert }, { item, headers, body }) => {
      let problem: Record<string, unknown> = {}
      const lines = await captureLogs(async () => {
        const response = await fetch(`${baseUrl()}/api/v1/__test__/echo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: body(),
        })
        assert.equal(response.status, 422)
        problem = await problemOf(response)
      })
      assert.equal((problem.errors as { code: string }[])[0].code, item)
      const errorLine = lines.find((line) => line.message === 'http.error')
      assert.equal(errorLine?.level, 'info')
    })

  test('a valid gzip body is still read', async ({ assert }) => {
    const response = await fetch(`${baseUrl()}/api/v1/__test__/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync('{"a": 1}'),
    })
    // The body parses; the route then fails CSRF, which runs after the body parser.
    assert.equal(response.status, 403)
  })
})

test.group('Database errors are logged without the values they quote', () => {
  test('a 22P02 logs its SQLSTATE and statement, not the submitted value', async ({ assert }) => {
    let body = ''
    const lines = await captureLogs(async () => {
      const response = await fetch(`${baseUrl()}/api/v1/__test__/bad-uuid`)
      assert.equal(response.status, 500)
      body = await response.text()
    })
    assert.notInclude(body, 'ram@example.com')
    const errorLine = lines.find((line) => line.message === 'http.error')
    assert.equal(errorLine?.level, 'error')
    assert.containsSubset(errorLine!.fields.err, {
      type: 'DatabaseError',
      sqlstate: '22P02',
      sql: 'SELECT $1::uuid',
    })
    assert.notInclude(JSON.stringify(errorLine!.fields), 'ram@example.com')
  })

  test('the access line carries the keyed IP hash, never the IP', async ({ assert }) => {
    const lines = await captureLogs(async () => {
      await fetch(`${baseUrl()}/api/v1/nothing-here`).then((response) => response.text())
    })
    const accessLine = lines.find((line) => line.message === 'http.request')
    assert.match(String(accessLine?.fields.ip_hash), /^[0-9a-f]{64}$/)
    // The test client connects over loopback, IPv4 or IPv6 depending on the host.
    const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1']
    const expected = loopback.map((ip) => keyedHash(hmacKeys.auditIp.release(), ip).toString('hex'))
    assert.include(expected, String(accessLine?.fields.ip_hash))
    for (const ip of loopback) assert.notInclude(JSON.stringify(accessLine?.fields), `"${ip}"`)
  })

  test('readiness answers 200 when the database answers and int8 is a number', async ({
    assert,
  }) => {
    const response = await fetch(`${baseUrl()}/health/ready`)
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { status: 'ok' })
  })

  test('readiness answers 503 when int8 arrives as a string', async ({ assert }) => {
    // As if start/database_types.ts were not preloaded: node-postgres's default.
    pg.types.setTypeParser(20, (text: string) => text)
    try {
      const response = await fetch(`${baseUrl()}/health/ready`)
      assert.equal(response.status, 503)
    } finally {
      pg.types.setTypeParser(20, parseInt8)
    }
  })

  test('an IPv4 address mapped into IPv6 hashes as plain IPv4', ({ assert }) => {
    const key = Buffer.alloc(32, 3)
    assert.deepEqual(ipHash(key, '::ffff:203.0.113.7'), ipHash(key, '203.0.113.7'))
    assert.notDeepEqual(ipHash(key, '::1'), ipHash(key, '203.0.113.7'))
  })

  test('health probes write no access line', async ({ assert }) => {
    const lines = await captureLogs(async () => {
      const response = await fetch(`${baseUrl()}/health/live`)
      assert.equal(response.status, 200)
      await response.text()
    })
    assert.isUndefined(lines.find((line) => line.message === 'http.request'))
  })
})
