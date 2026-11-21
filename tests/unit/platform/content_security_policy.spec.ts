import { test } from '@japa/runner'
import {
  checkedReportUri,
  definePolicy,
  omitDirective,
  serializePolicy,
} from '#modules/platform/content_security_policy'
import { csp } from '#config/shield'

/*
 * T-SEC-035, the report-only part (docs/07 §7.3, RF-34): the two policies
 * and how one is written as a header. Until M7 the target policy is sent as
 * Content-Security-Policy-Report-Only, and the enforced one is the target
 * with inline styles allowed. The expected strings are written out here, so a
 * change to config/shield.ts must change this snapshot too.
 */

const N = 'abc123'

test.group('T-SEC-035 Content-Security-Policy policies', () => {
  test('T-SEC-035 the target policy is 07 §7.3 with the nonce resolved', ({ assert }) => {
    assert.equal(
      serializePolicy(csp.target, N),
      "default-src 'self'; script-src 'self' 'nonce-abc123' 'report-sample'; style-src 'self' 'nonce-abc123' 'report-sample'; " +
        "style-src-attr 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; " +
        "connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; " +
        "object-src 'none'"
    )
  })

  test('T-SEC-035 the enforced policy differs only by inline styles', ({ assert }) => {
    assert.equal(
      serializePolicy(csp.enforced, N),
      "default-src 'self'; script-src 'self' 'nonce-abc123' 'report-sample'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; form-action 'self'; " +
        "frame-ancestors 'none'; base-uri 'self'; object-src 'none'"
    )
  })

  test('T-SEC-035 a report URI adds report-uri and report-to', ({ assert }) => {
    const uri = 'https://o1.ingest.sentry.io/api/2/security/?sentry_key=k'
    const policy = definePolicy({ defaultSrc: ["'self'"] })
    assert.equal(
      serializePolicy(policy, N, uri),
      `default-src 'self'; report-uri ${uri}; report-to csp-endpoint`
    )
  })

  test('T-SEC-035 definePolicy refuses {label}')
    .with([
      // Shield's lesson: a quoted nonce keyword would be sent literally.
      { label: 'a quoted nonce keyword', value: "'@nonce'" },
      { label: 'a separator inside a value', value: "'self'; script-src *" },
      { label: 'a space inside a value', value: "'self' data:" },
      { label: 'a comma inside a value', value: "'self',data:" },
      { label: 'an empty value', value: '' },
      { label: 'an unquoted keyword', value: 'self' },
      { label: 'an unquoted nonce', value: 'nonce-abc' },
      { label: 'an unquoted hash', value: 'sha256-abc=' },
    ])
    .run(({ assert }, { value }) => {
      assert.throws(() => definePolicy({ defaultSrc: [value] }))
    })

  test('T-SEC-035 definePolicy refuses a directive without values', ({ assert }) => {
    assert.throws(() => definePolicy({ defaultSrc: [] }))
  })

  test('T-SEC-035 definePolicy refuses a directive name that is not camelCase', ({ assert }) => {
    assert.throws(() => definePolicy({ 'default-src': ["'self'"] }))
    assert.throws(() => definePolicy({ 'defaultSrc; script-src': ["'self'"] }))
  })

  test('T-SEC-035 a defined policy and its values cannot change', ({ assert }) => {
    const policy = definePolicy({ defaultSrc: ["'self'"] })
    assert.isTrue(Object.isFrozen(policy))
    assert.isTrue(Object.isFrozen(policy.defaultSrc))
  })

  test('T-SEC-035 omitDirective keeps the other directives in order', ({ assert }) => {
    const policy = definePolicy({ a: ["'self'"], b: ["'none'"], c: ['data:'] })
    assert.deepEqual(Object.keys(omitDirective(policy, 'b')), ['a', 'c'])
  })

  test('T-SEC-035 CSP_REPORT_URI refuses {label}')
    .with([
      { label: 'a semicolon', uri: 'https://r.example/a;script-src' },
      { label: 'a comma', uri: 'https://r.example/a,b' },
      { label: 'a double quote', uri: 'https://r.example/a"b' },
      { label: 'a space', uri: 'https://r.example/a b' },
    ])
    .run(({ assert }, { uri }) => {
      assert.throws(() => checkedReportUri(uri))
    })

  test('T-SEC-035 CSP_REPORT_URI passes a plain URL and no value', ({ assert }) => {
    const uri = 'https://o1.ingest.sentry.io/api/2/security/?sentry_key=k'
    assert.equal(checkedReportUri(uri), uri)
    assert.isUndefined(checkedReportUri(undefined))
  })
})
