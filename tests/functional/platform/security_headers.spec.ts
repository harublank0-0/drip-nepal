import { test } from '@japa/runner'
import env from '#start/env'

/*
 * T-SEC-035, the report-only part (docs/07 §7.3, RF-34): every answer of the
 * server carries the browser headers, because they are set in the server
 * middleware stack. That includes an unknown URL's 404 page, which never
 * reaches the router middleware (docs/07 note 35), and static files. The CSP
 * headers carry one nonce, new on every request, and the root view's inline
 * theme script carries the same one. They are on in every environment except
 * development, this test run included. CSP_REPORT_URI is unset here, so no
 * report endpoint is named.
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`

const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1]

const target = (nonce: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'report-sample'; style-src 'self' 'nonce-${nonce}' 'report-sample'; ` +
  `style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; ` +
  `connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; ` +
  `object-src 'none'`

const enforced = (nonce: string) =>
  `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'report-sample'; style-src 'self' 'unsafe-inline'; ` +
  `img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; form-action 'self'; ` +
  `frame-ancestors 'none'; base-uri 'self'; object-src 'none'`

test.group('T-SEC-035 browser headers on every answer', () => {
  test('T-SEC-035 {label} carries the browser headers')
    .with([
      { label: 'an unknown URL (the 404 page)', path: '/t-sec-035-no-such-page', status: 404 },
      { label: 'a routed page', path: '/dev/design-system', status: 200 },
      { label: 'a static file', path: '/favicon.png', status: 200 },
    ])
    .run(async ({ assert }, { path, status }) => {
      const response = await fetch(`${base()}${path}`, { headers: { Accept: 'text/html' } })
      await response.arrayBuffer()
      assert.equal(response.status, status)
      assert.equal(response.headers.get('x-frame-options'), 'DENY')
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff')
      assert.equal(response.headers.get('strict-transport-security'), 'max-age=15552000')
      const enforcedHeader = response.headers.get('content-security-policy')
      const nonce = nonceOf(enforcedHeader)
      assert.match(nonce ?? '', /^[\w-]{16,}$/)
      assert.equal(enforcedHeader, enforced(nonce!))
      assert.equal(response.headers.get('content-security-policy-report-only'), target(nonce!))
      assert.isNull(response.headers.get('reporting-endpoints'))
    })

  test('T-SEC-035 the theme script carries the header nonce, new on every request', async ({
    assert,
  }) => {
    const nonces = []
    for (let visit = 0; visit < 2; visit++) {
      const response = await fetch(`${base()}/t-sec-035-no-such-page`, {
        headers: { Accept: 'text/html', Cookie: 'dn_theme=system' },
      })
      const html = await response.text()
      const scriptNonce = /<script nonce="([^"]*)">document\.documentElement/.exec(html)?.[1]
      const headerNonce = nonceOf(response.headers.get('content-security-policy'))
      const reportOnlyNonce = nonceOf(response.headers.get('content-security-policy-report-only'))
      assert.isString(scriptNonce)
      assert.equal(scriptNonce, headerNonce)
      assert.equal(scriptNonce, reportOnlyNonce)
      nonces.push(scriptNonce)
    }
    assert.notEqual(nonces[0], nonces[1])
  })
})
