import { test } from '@japa/runner'
import env from '#start/env'

/*
 * T-SEC-042: CORS answers only the application's own origin, `APP_URL`'s,
 * in every environment, this test run included (docs/11 §4.3, RF-43). Any
 * other origin, a local dev server on another port among them, gets no
 * `Access-Control-Allow-Origin`, so a browser keeps its page from reading
 * a response or sending a credentialed request.
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`
const own = () => new URL(env.get('APP_URL')).origin

function preflight(origin: string) {
  return fetch(`${base()}/api/v1/__test__/cors`, {
    method: 'OPTIONS',
    headers: {
      'Origin': origin,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type',
    },
  })
}

test.group('T-SEC-042 CORS allows only the application origin', () => {
  test('T-SEC-042 a preflight from APP_URL is allowed, with credentials', async ({ assert }) => {
    const response = await preflight(own())
    assert.equal(response.headers.get('access-control-allow-origin'), own())
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true')
  })

  test('T-SEC-042 a preflight from {origin} is not allowed')
    .with([
      { origin: 'https://evil.example' },
      { origin: 'http://localhost:5173' },
      { origin: 'null' },
    ])
    .run(async ({ assert }, { origin }) => {
      const response = await preflight(origin)
      assert.isNull(response.headers.get('access-control-allow-origin'))
    })

  test('T-SEC-042 a simple request from another origin gets no CORS headers', async ({
    assert,
  }) => {
    const response = await fetch(`${base()}/no-such-page`, {
      headers: { Origin: 'https://evil.example' },
    })
    assert.isNull(response.headers.get('access-control-allow-origin'))
    assert.isNull(response.headers.get('access-control-allow-credentials'))
  })
})
