import { test } from '@japa/runner'
import { request as httpRequest } from 'node:http'
import router from '@adonisjs/core/services/router'
import db from '@adonisjs/lucid/services/db'
import env from '#start/env'
import { bodyLimitFor, DEFAULT_BODY_LIMIT_BYTES } from '#middleware/request_body_middleware'

/*
 * Request body shape and size (docs/06 §9.2, ADR-0013):
 * - T-MED-002: a `multipart/form-data` body is refused on every route of the
 *   router, whatever the method, with 422 `VALIDATION_FAILED`
 *   (`unsupported_media_type`) on the API and a 422 page elsewhere, before
 *   the session or CSRF check, so it writes no session row.
 * - T-API-013: a JSON body over the route's limit (256 KB, 512 KB for the
 *   catalog writes) is 413 `PAYLOAD_TOO_LARGE`, also before the session.
 *
 * The routes below exist only in this test run.
 */

router.post('/api/v1/__test__/body-echo', ({ request }) => ({ size: request.raw()?.length ?? 0 }))

const host = () => env.get('HOST')
const port = () => Number(env.get('PORT'))

type Answer = {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

// node:http, because fetch refuses a body on GET and HEAD.
function send(
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string | Buffer
) {
  return new Promise<Answer>((resolve, reject) => {
    const req = httpRequest(
      {
        host: host(),
        port: port(),
        method,
        path,
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          })
        )
      }
    )
    req.on('error', reject)
    req.end(body)
  })
}

/*
 * Declares a body of `length` bytes but sends only `head`, then waits for
 * the answer. An answer that arrives proves the server refused the body
 * without reading it: reading would wait for bytes that never come.
 */
function answerBeforeBody(
  method: string,
  path: string,
  headers: Record<string, string>,
  length: number,
  head: Buffer
) {
  return new Promise<Answer>((resolve, reject) => {
    const req = httpRequest(
      {
        host: host(),
        port: port(),
        method,
        path,
        headers: { ...headers, 'Content-Length': length },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end', () => {
          clearTimeout(timer)
          req.destroy()
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString(),
          })
        })
      }
    )
    const timer = setTimeout(() => {
      req.destroy()
      reject(new Error(`${method} ${path} waited for the body: it was being read`))
    }, 3000)
    req.on('error', (error) => {
      if (!req.destroyed) reject(error)
    })
    req.write(head)
  })
}

const BOUNDARY = 'dripnepal-test-boundary'
const MULTIPART = [
  `--${BOUNDARY}`,
  'Content-Disposition: form-data; name="file"; filename="photo.jpg"',
  'Content-Type: image/jpeg',
  '',
  'not really a jpeg',
  `--${BOUNDARY}--`,
  '',
].join('\r\n')

// Every route the router knows, with each parameter filled in.
function everyRoute() {
  const routes: { method: string; path: string }[] = []
  for (const list of Object.values(router.toJSON())) {
    for (const route of list) {
      const path = route.pattern
        .replace(/:[^/]+/g, '0195f3a0-0000-7000-8000-000000000001')
        .replace(/\*/g, 'any')
      for (const method of route.methods) routes.push({ method, path })
    }
  }
  return routes
}

const sessionCount = async () => {
  const [{ count }] = await db.from('sessions').count('* as count')
  return Number(count)
}

test.group('T-MED-002 multipart is refused on every route', () => {
  test('T-MED-002 every route answers 422 to a multipart body and writes no session', async ({
    assert,
  }) => {
    const routes = everyRoute()
    // The application's routes and those the spec files of this run register.
    assert.deepInclude(routes, { method: 'GET', path: '/dev/design-system' })
    assert.deepInclude(routes, { method: 'POST', path: '/api/v1/__test__/body-echo' })
    const before = await sessionCount()

    for (const { method, path } of routes) {
      const answer = await send(
        method,
        path,
        {
          'Content-Type': `multipart/form-data; boundary=${BOUNDARY}`,
          'Accept': 'application/json',
        },
        MULTIPART
      )
      assert.equal(answer.status, 422, `${method} ${path}`)
      assert.isUndefined(
        ([] as string[])
          .concat(answer.headers['set-cookie'] ?? [])
          .find((c) => c.startsWith('dripnepal_session=')),
        `${method} ${path} set a session cookie`
      )
      if (path.startsWith('/api/') && method !== 'HEAD') {
        const problem = JSON.parse(answer.body)
        assert.equal(problem.code, 'VALIDATION_FAILED', `${method} ${path}`)
        assert.equal(problem.errors[0].code, 'unsupported_media_type', `${method} ${path}`)
      }
    }
    assert.equal(await sessionCount(), before)
  })

  test('T-MED-002 a large upload is answered before its body is sent', async ({ assert }) => {
    const head = Buffer.from(MULTIPART.slice(0, -`--${BOUNDARY}--\r\n`.length))
    const answer = await answerBeforeBody(
      'POST',
      '/api/v1/__test__/body-echo',
      { 'Content-Type': `multipart/form-data; boundary=${BOUNDARY}` },
      3 * 1024 * 1024,
      head
    )
    assert.equal(answer.status, 422)
    assert.equal(JSON.parse(answer.body).errors[0].code, 'unsupported_media_type')
  })
})

test.group('T-API-013 JSON body limits', () => {
  const json = (bytes: number) => JSON.stringify({ text: 'x'.repeat(bytes - 11) })

  test('T-API-013 {label} answers {status}')
    .with([
      // Passes the size check; then fails CSRF (no token), which runs after it.
      {
        label: 'a body just under 256 KB',
        bytes: DEFAULT_BODY_LIMIT_BYTES,
        status: 403,
        code: 'FORBIDDEN',
      },
      {
        label: 'a body just over 256 KB',
        bytes: DEFAULT_BODY_LIMIT_BYTES + 1,
        status: 413,
        code: 'PAYLOAD_TOO_LARGE',
      },
      // The body parser's own json.limit (512 KB).
      { label: 'a body over 512 KB', bytes: 600 * 1024, status: 413, code: 'PAYLOAD_TOO_LARGE' },
    ])
    .run(async ({ assert }, { bytes, status, code }) => {
      const body = json(bytes)
      assert.lengthOf(body, bytes)
      const before = await sessionCount()
      const answer = await send(
        'POST',
        '/api/v1/__test__/body-echo',
        { 'Content-Type': 'application/json' },
        body
      )
      assert.equal(answer.status, status)
      assert.equal(JSON.parse(answer.body).code, code)
      if (status === 413) assert.equal(await sessionCount(), before)
    })

  test('T-API-013 the catalog writes may send 512 KB', ({ assert }) => {
    for (const operation of ['createProduct', 'updateProduct', 'replaceProductVariants']) {
      assert.equal(bodyLimitFor(operation), 512 * 1024)
    }
    assert.equal(bodyLimitFor('placeOrder'), 256 * 1024)
    assert.equal(bodyLimitFor(undefined), 256 * 1024)
  })

  test('T-API-013 a 900 KB {type} body is refused from its length, before it is read')
    .with([
      { type: 'form', contentType: 'application/x-www-form-urlencoded', head: 'text=' },
      { type: 'text', contentType: 'text/plain', head: 'x' },
      { type: 'JSON', contentType: 'application/json', head: '{"text":"' },
    ])
    .run(async ({ assert }, { contentType, head }) => {
      const before = await sessionCount()
      const answer = await answerBeforeBody(
        'POST',
        '/api/v1/__test__/body-echo',
        { 'Content-Type': contentType },
        900 * 1024,
        Buffer.from(head)
      )
      assert.equal(answer.status, 413)
      assert.equal(JSON.parse(answer.body).code, 'PAYLOAD_TOO_LARGE')
      assert.equal(await sessionCount(), before)
    })
})
