import { test } from '@japa/runner'
import {
  TOTP,
  base32Decode,
  base32Encode,
  generateTotpSecret,
  hotp,
  matchTotp,
  otpauthUri,
  totpStep,
} from '#modules/identity/domain/totp'
import { TOTP_CODE_PATTERN, totpInput } from '#shared/constants/auth'

/*
 * T-SEC-008, the TOTP rules of docs/07 §3.9 and 01 AC-FR-IAM-007-3, on the
 * `node:crypto` implementation of app/modules/identity/domain/totp.ts:
 * - the RFC 4226 appendix D HOTP values and the RFC 6238 appendix B SHA-1
 *   TOTP values (their last six digits) for the RFC's ASCII secret
 *   "12345678901234567890";
 * - base32 (RFC 4648) round trips and the RFC's test strings;
 * - a code counts in the current step and one either side, never two
 *   away, and only in a step later than `mfa_last_used_step`, so an
 *   accepted code is never accepted again;
 * - a new secret has 160 bits; the `otpauth://` URI names the issuer, the
 *   account, the secret and the parameters, percent-encoded.
 * T-UI-036, the code field's paste rule: spaces and hyphens are dropped
 * before the six-digit check, so "123 456" from an app passes.
 */

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii')
const RFC_SECRET_BASE32 = base32Encode(RFC_SECRET)

test.group('T-SEC-008 TOTP codes (RFC 4226, RFC 6238)', () => {
  test('T-SEC-008 HOTP counter {counter} gives {code} [RFC 4226 appendix D]')
    .with([
      { counter: 0, code: '755224' },
      { counter: 1, code: '287082' },
      { counter: 2, code: '359152' },
      { counter: 3, code: '969429' },
      { counter: 4, code: '338314' },
      { counter: 5, code: '254676' },
      { counter: 6, code: '287922' },
      { counter: 7, code: '162583' },
      { counter: 8, code: '399871' },
      { counter: 9, code: '520489' },
    ])
    .run(({ assert }, { counter, code }) => {
      assert.equal(hotp(RFC_SECRET, counter), code)
    })

  test('T-SEC-008 TOTP at {seconds} s gives {code} [RFC 6238 appendix B, SHA-1, last 6 digits]')
    .with([
      { seconds: 59, code: '287082' },
      { seconds: 1111111109, code: '081804' },
      { seconds: 1111111111, code: '050471' },
      { seconds: 1234567890, code: '005924' },
      { seconds: 2000000000, code: '279037' },
      { seconds: 20000000000, code: '353130' },
    ])
    .run(({ assert }, { seconds, code }) => {
      const nowMs = seconds * 1000
      assert.equal(hotp(RFC_SECRET, totpStep(nowMs)), code)
      assert.equal(
        matchTotp(RFC_SECRET_BASE32, code, { lastUsedStep: null, nowMs }),
        totpStep(nowMs)
      )
    })

  test('T-SEC-008 base32 encodes the RFC 4648 test strings and round-trips 20 random bytes', ({
    assert,
  }) => {
    for (const [plain, encoded] of [
      ['f', 'MY'],
      ['fo', 'MZXQ'],
      ['foo', 'MZXW6'],
      ['foob', 'MZXW6YQ'],
      ['fooba', 'MZXW6YTB'],
      ['foobar', 'MZXW6YTBOI'],
    ]) {
      assert.equal(base32Encode(Buffer.from(plain)), encoded)
      assert.equal(base32Decode(encoded).toString(), plain)
    }
    const secret = generateTotpSecret()
    assert.match(secret, /^[A-Z2-7]{32}$/)
    assert.lengthOf(base32Decode(secret), TOTP.secretBytes)
    assert.equal(base32Encode(base32Decode(secret)), secret)
    // Spaces, hyphens, padding and lower case, as a person types a key, decode alike.
    assert.deepEqual(base32Decode('mzxw 6ytb-oi=='), Buffer.from('foobar'))
    assert.throws(() => base32Decode('MZXW1'))
  })

  test('T-SEC-008 a code counts one step either side of now, not two [AC-FR-IAM-007-3]', ({
    assert,
  }) => {
    const nowMs = 1234567890 * 1000
    const step = totpStep(nowMs)
    const codeOf = (offset: number) => hotp(RFC_SECRET, step + offset)
    for (const offset of [-1, 0, 1]) {
      assert.equal(
        matchTotp(RFC_SECRET_BASE32, codeOf(offset), { lastUsedStep: null, nowMs }),
        step + offset,
        `offset ${offset}`
      )
    }
    for (const offset of [-3, -2, 2, 3]) {
      assert.isNull(
        matchTotp(RFC_SECRET_BASE32, codeOf(offset), { lastUsedStep: null, nowMs }),
        `offset ${offset}`
      )
    }
  })

  test('T-SEC-008 a code whose step is not later than mfa_last_used_step is refused, so it cannot be replayed [AC-FR-IAM-007-3]', ({
    assert,
  }) => {
    const nowMs = 2000000000 * 1000
    const step = totpStep(nowMs)
    const code = hotp(RFC_SECRET, step)
    assert.equal(matchTotp(RFC_SECRET_BASE32, code, { lastUsedStep: step - 1, nowMs }), step)
    assert.isNull(matchTotp(RFC_SECRET_BASE32, code, { lastUsedStep: step, nowMs }))
    assert.isNull(matchTotp(RFC_SECRET_BASE32, code, { lastUsedStep: step + 1, nowMs }))
    // The next step's code still passes after this one was used.
    const next = hotp(RFC_SECRET, step + 1)
    assert.equal(matchTotp(RFC_SECRET_BASE32, next, { lastUsedStep: step, nowMs }), step + 1)
  })

  test('T-SEC-008 anything but six digits never matches', ({ assert }) => {
    const nowMs = 59 * 1000
    for (const code of ['', '28708', '2870820', '28708a', ' 287082', '287 082', '２８７０８２']) {
      assert.isNull(matchTotp(RFC_SECRET_BASE32, code, { lastUsedStep: null, nowMs }), code)
    }
  })

  test('T-SEC-008 the otpauth URI names the issuer, the account and the secret, percent-encoded', ({
    assert,
  }) => {
    const uri = otpauthUri({
      issuer: 'DripNepal (staging)',
      account: 'ram+staff@example.com',
      secret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
    })
    assert.equal(
      uri,
      'otpauth://totp/DripNepal%20(staging):ram%2Bstaff%40example.com' +
        '?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=DripNepal%20(staging)' +
        '&algorithm=SHA1&digits=6&period=30'
    )
    assert.notInclude(uri, '+')
  })
})

test.group('T-UI-036 the code field', () => {
  test('T-UI-036 a pasted {value} is sent as {sent}')
    .with([
      { value: '123456', sent: '123456', valid: true },
      { value: '123 456', sent: '123456', valid: true },
      { value: ' 123-456 ', sent: '123456', valid: true },
      { value: '12345', sent: '12345', valid: false },
      { value: '12a456', sent: '12a456', valid: false },
    ])
    .run(({ assert }, { value, sent, valid }) => {
      assert.equal(totpInput(value), sent)
      assert.equal(TOTP_CODE_PATTERN.test(totpInput(value)), valid)
    })
})
