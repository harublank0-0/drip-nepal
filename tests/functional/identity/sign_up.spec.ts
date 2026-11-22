import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { appUrl } from '#config/app'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { phoneBlindIndex } from '#modules/platform/crypto/blind_index'
import { currentLegalVersions } from '#modules/platform/legal_documents'
import type { JobEnvelope, JobPayloads } from '#modules/platform/jobs'
import { dispatchNotification } from '#modules/notifications/jobs/dispatch'
import { sendEmail } from '#modules/notifications/jobs/send_email'
import { statusOf } from '#tests/support/courier_http'
import { captureEmails } from '#tests/support/email'
import { queued, useJobBoss } from '#tests/support/jobs'
import {
  RESEND_PATH,
  SIGN_UP_PASSWORD,
  SIGN_UP_PATH,
  countingHashes,
  dispatchJobsFor,
  forgetSignUp,
  guest,
  liveToken,
  postJson,
  signUpBody,
  userByEmail,
  type Guest,
} from '#tests/support/identity'

/*
 * `signUp` over HTTP (docs/06 §13.3; 01 FR-IAM-001, FR-IAM-013; 02 J-04;
 * M1 part 2a):
 * - T-IAM-001: a valid sign-up answers 202, creates one
 *   `pending_verification` user, one `email_verification` token and one
 *   queued verification email, writes the `user.signup` audit row, and
 *   signs nobody in; field rules (email, password 10–128, name, the 18+
 *   confirmation, the consents, the mobile number) answer 422 and write
 *   nothing.
 * - T-SEC-003: `status`, `email_verified_at`, `security_stamp` or a role in
 *   the body are refused with `unknown_field`; a created row has the
 *   defaults.
 * - T-SEC-012 and T-IAM-104: a registered email, in any letter case, gets
 *   the same status and body, spends one hash as a new one does, and its
 *   holder gets the "account already exists" email instead of a second
 *   account or token.
 * - T-IAM-112: an address in `.invalid` is refused.
 * - T-IAM-103: the phone is stored only as ciphertext, blind index and last
 *   four digits.
 * - T-SEC-013: a sign-up without the XSRF header is refused.
 * The limiters, which commit on their own connection, are in
 * tests/concurrency/identity/sign_up.spec.ts.
 */

type TokenDispatch = Extract<
  JobPayloads['notifications.dispatch'],
  { event: 'user_token.issued' }
> &
  JobEnvelope
type NoticeDispatch = Extract<
  JobPayloads['notifications.dispatch'],
  { event: 'user.signup_attempted' }
> &
  JobEnvelope

const auditRows = (userId: string, action: string) =>
  db.from('audit_logs').where({ subject_type: 'user', subject_id: userId, action })

// The one link of a plain-text part.
function linkIn(text: string) {
  const match = /https?:\/\/\S+/.exec(text)
  if (!match) throw new Error('no link in the text part')
  return new URL(match[0])
}

// Dispatches one event and sends the email it queued, with the capturing fake.
async function deliver(event: TokenDispatch | NoticeDispatch) {
  const outcome = await dispatchNotification(event)
  if (outcome.kind !== 'queued') throw new Error(`dispatch gave ${outcome.kind}`)
  const jobs = await queued<JobPayloads['notifications.send_email'] & JobEnvelope>(
    'notifications.send_email'
  )
  const job = jobs.find((queuedJob) => queuedJob.data.delivery_id === outcome.deliveryId)
  if (!job) throw new Error('dispatch queued no send job')
  return sendEmail(job.data)
}

test.group('T-IAM-001 sign-up', (group) => {
  let client: Guest
  let emails: ReturnType<typeof captureEmails>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    emails = captureEmails()
    return async () => {
      emails.restore()
      await forgetSignUp(client.ip)
    }
  })

  test('T-IAM-001 a valid sign-up answers 202 and creates one pending user, one token and one queued verification email [AC-FR-IAM-001-1, AC-J04-01]', async ({
    assert,
  }) => {
    const body = signUpBody('t-iam-001')
    const response = await postJson(client, SIGN_UP_PATH, body)
    assert.equal(response.status, 202, response.text)
    assert.deepEqual(response.body, { data: { status: 'verification_email_sent' } })

    const user = await userByEmail(body.email)
    assert.isNotNull(user)
    assert.include(user, {
      email: body.email,
      full_name: 'Sita Shrestha',
      status: 'pending_verification',
      email_verified_at: null,
      marketing_email_consent_at: null,
      marketing_sms_consent_at: null,
      phone_enc: null,
      phone_hash: null,
      phone_last4: null,
    })
    assert.instanceOf(user.age_confirmed_at, Date)
    // The scrypt PHC string of config/hash.ts, never the password itself.
    assert.match(user.password_hash, /^\$scrypt\$/)
    assert.notInclude(user.password_hash, SIGN_UP_PASSWORD)

    // One live token, 24 hours (docs/07 §3.8), and one dispatch job for it.
    const tokens = await db.from('user_tokens').where('user_id', user.id)
    assert.lengthOf(tokens, 1)
    assert.include(tokens[0], { purpose: 'email_verification', consumed_at: null })
    assert.equal(tokens[0].expires_at.getTime() - tokens[0].created_at.getTime(), 86_400_000)
    const jobs = await dispatchJobsFor(user.id)
    assert.lengthOf(jobs, 1)
    assert.include(jobs[0].data, { event: 'user_token.issued', user_token_id: tokens[0].id })
    assert.equal((jobs[0].data as TokenDispatch).request_id, response.headers.get('x-request-id'))

    // One audit row: the consents by name and the legal versions the page links.
    const audits = await auditRows(user.id, 'user.signup')
    assert.lengthOf(audits, 1)
    assert.include(audits[0], { actor_type: 'customer', actor_user_id: user.id })
    assert.deepEqual(audits[0].changes, {
      status: 'pending_verification',
      source: 'signup',
      changed: ['age_confirmed_at'],
      legal_document_versions: currentLegalVersions(),
    })
    assert.lengthOf(audits[0].ip_hash, 32)

    // Nobody is signed in (docs/07 TM-09): the session is a guest's.
    assert.lengthOf(await db.from('sessions').where('user_id', user.id), 0)
    const resend = await postJson(client, RESEND_PATH, {})
    assert.equal(resend.status, 401)

    // The email: APP_URL/verify-email with the issued token (02 J-04 step 4).
    const sent = await deliver(jobs[0].data as TokenDispatch)
    assert.equal(sent.kind, 'sent')
    assert.lengthOf(emails.fake.sent, 1)
    const [message] = emails.fake.sent
    assert.equal(message.to, body.email)
    assert.equal(message.template, 'identity.email_verification')
    assert.equal(message.subject, 'Confirm your email for DripNepal')
    const link = linkIn(message.text)
    assert.equal(link.origin, new URL(appUrl).origin)
    assert.equal(link.pathname, '/verify-email')
    assert.deepEqual(
      createHash('sha256')
        .update(link.searchParams.get('token') ?? '')
        .digest(),
      tokens[0].token_hash
    )
  })

  test('T-IAM-001 the email is trimmed and lower-cased, the name kept in NFC, and each ticked consent stored [AC-J04-05, RF-22]', async ({
    assert,
  }) => {
    const base = signUpBody('t-iam-001-case')
    const response = await postJson(client, SIGN_UP_PATH, {
      ...base,
      email: `  ${base.email.toUpperCase()} `,
      // "José" with a combining acute accent; NFC composes it.
      full_name: '  José Thapa ',
      marketing_email_consent: true,
    })
    assert.equal(response.status, 202, response.text)
    const user = await userByEmail(base.email)
    assert.equal(user.email, base.email)
    assert.equal(user.full_name, 'José Thapa')
    assert.instanceOf(user.marketing_email_consent_at, Date)
    assert.isNull(user.marketing_sms_consent_at)
    const [audit] = await auditRows(user.id, 'user.signup')
    assert.deepEqual(audit.changes.changed, ['age_confirmed_at', 'marketing_email_consent_at'])
  })

  test(
    'T-IAM-001 {name} is refused with 422 on {field} and writes nothing [AC-J04-03, AC-FR-IAM-001-1]'
  )
    .with([
      { name: 'a 9-character password', field: 'password', change: { password: 'a'.repeat(9) } },
      {
        name: 'a 129-character password',
        field: 'password',
        change: { password: 'a'.repeat(129) },
      },
      { name: 'an email without a domain', field: 'email', change: { email: 'ram-at-example' } },
      {
        name: 'a 255-character email',
        field: 'email',
        change: { email: `${'a'.repeat(243)}@example.com` },
      },
      { name: 'an empty name', field: 'full_name', change: { full_name: '   ' } },
      { name: 'a 101-character name', field: 'full_name', change: { full_name: 'a'.repeat(101) } },
      {
        // U+0958 is a composition exclusion: NFC makes it two code points, so 100 become 101.
        name: 'a 100-character name that NFC lengthens',
        field: 'full_name',
        change: { full_name: `\u0958${'a'.repeat(99)}` },
      },
      { name: 'an unticked 18+ box', field: 'age_confirmed', change: { age_confirmed: false } },
      { name: 'no 18+ box', field: 'age_confirmed', change: { age_confirmed: undefined } },
      {
        name: 'an 18+ box sent as "yes"',
        field: 'age_confirmed',
        change: { age_confirmed: 'yes' },
      },
      { name: 'an 18+ box sent as 1', field: 'age_confirmed', change: { age_confirmed: 1 } },
      {
        name: 'a consent that is not a boolean',
        field: 'marketing_email_consent',
        change: { marketing_email_consent: 'yes' },
      },
      {
        name: 'no SMS consent',
        field: 'marketing_sms_consent',
        change: { marketing_sms_consent: undefined },
      },
    ])
    .run(async ({ assert }, { field, change }) => {
      const body = signUpBody('t-iam-001-refused', change)
      const response = await postJson(client, SIGN_UP_PATH, body)
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(
        response.body.errors.map((item: { field: string }) => item.field),
        [field]
      )
      assert.isNull(await userByEmail(body.email))
      assert.lengthOf(await queued('notifications.dispatch'), 0)
      assert.lengthOf(await db.from('audit_logs').where('action', 'user.signup'), 0)
    })

  test('T-IAM-001 a name is counted in code points after NFC, as users_full_name_check counts it', async ({
    assert,
  }) => {
    // 100 letters with a combining accent: 200 code points as sent, 100 once composed.
    const body = signUpBody('t-iam-001-nfc', { full_name: 'e\u0301'.repeat(100) })
    const response = await postJson(client, SIGN_UP_PATH, body)
    assert.equal(response.status, 202, response.text)
    const user = await userByEmail(body.email)
    assert.equal(user.full_name, '\u00e9'.repeat(100))
  })

  test('T-IAM-001 a 128-character password is accepted [AC-J04-03]', async ({ assert }) => {
    const body = signUpBody('t-iam-001-long', { password: 'p'.repeat(128) })
    const response = await postJson(client, SIGN_UP_PATH, body)
    assert.equal(response.status, 202, response.text)
    assert.isNotNull(await userByEmail(body.email))
  })

  test('T-IAM-001 the mobile {input} is stored as {e164} [AC-J04-04, AC-FR-IAM-001-5]')
    .with([
      { input: '9841234567', e164: '+9779841234567' },
      { input: '+977 984-123-4567', e164: '+9779841234567' },
      { input: '9612345678', e164: '+9779612345678' },
    ])
    .run(async ({ assert }, { input, e164 }) => {
      const body = signUpBody('t-iam-001-phone', { phone: input })
      const response = await postJson(client, SIGN_UP_PATH, body)
      assert.equal(response.status, 202, response.text)
      const user = await userByEmail(body.email)
      assert.equal(decryptField(user.phone_enc, 'users.phone_enc'), e164)
      assert.deepEqual(user.phone_hash, phoneBlindIndex(e164))
      assert.equal(user.phone_last4, e164.slice(-4))
      assert.isNull(user.phone_verified_at)
    })

  test('T-IAM-001 another account may use the same mobile number [AC-FR-IAM-001-5]', async ({
    assert,
  }) => {
    const first = signUpBody('t-iam-001-shared', { phone: '9801234567' })
    const second = signUpBody('t-iam-001-shared', { phone: '980-123-4567' })
    assert.equal(await statusOf(postJson(client, SIGN_UP_PATH, first)), 202)
    assert.equal(await statusOf(postJson(client, SIGN_UP_PATH, second)), 202)
    const rows = await db.from('users').where('phone_hash', phoneBlindIndex('+9779801234567'))
    assert.sameMembers(
      rows.map((row) => row.email),
      [first.email, second.email]
    )
  })

  test('T-IAM-001 the mobile {input} is refused with 422 on phone [AC-J04-04]')
    .with([{ input: '9012345678' }, { input: '984123456' }, { input: '014123456' }])
    .run(async ({ assert }, { input }) => {
      const body = signUpBody('t-iam-001-bad-phone', { phone: input })
      const response = await postJson(client, SIGN_UP_PATH, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        response.body.errors.map((item: { field: string; code: string }) => [
          item.field,
          item.code,
        ]),
        [['phone', 'nepal_mobile']]
      )
      assert.isNull(await userByEmail(body.email))
    })

  test('T-IAM-103 after sign-up the users row holds the phone only as ciphertext, blind index and last four digits', async ({
    assert,
  }) => {
    const body = signUpBody('t-iam-103', { phone: '+977 9851234567' })
    assert.equal(await statusOf(postJson(client, SIGN_UP_PATH, body)), 202)
    const user = await userByEmail(body.email)
    const raw = JSON.stringify({ ...user, phone_hash: user.phone_hash.toString('hex') })
    for (const form of ['9851234567', '+9779851234567', '985123456']) {
      assert.notInclude(raw, form)
    }
    assert.match(user.phone_enc, /^v1\.[A-Za-z0-9_-]+\./)
    assert.equal(user.phone_last4, '4567')
    const found = await db
      .from('users')
      .where('phone_hash', phoneBlindIndex('+9779851234567'))
      .select('id')
    assert.deepEqual(
      found.map((row) => row.id),
      [user.id]
    )
  })

  test('T-IAM-112 the reserved address {email} is refused with 422 on email and creates no user')
    .with([{ email: 'deleted-1@anonymized.invalid' }, { email: 'ram@dev.dripnepal.invalid' }])
    .run(async ({ assert }, { email }) => {
      const response = await postJson(client, SIGN_UP_PATH, signUpBody('unused', { email }))
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        response.body.errors.map((item: { field: string; code: string }) => [
          item.field,
          item.code,
        ]),
        [['email', 'reserved_domain']]
      )
      assert.isNull(await userByEmail(email))
    })

  test('T-SEC-013 a sign-up without X-XSRF-TOKEN gets 403 FORBIDDEN and creates no user', async ({
    assert,
  }) => {
    const body = signUpBody('t-sec-013')
    const response = await postJson(client, SIGN_UP_PATH, body, { 'X-XSRF-TOKEN': '' })
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'FORBIDDEN')
    assert.isNull(await userByEmail(body.email))
  })
})

test.group('T-SEC-003 server-owned fields on sign-up', (group) => {
  let client: Guest
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    return () => forgetSignUp(client.ip)
  })

  test(
    'T-SEC-003 a sign-up with {member} is refused with 422 unknown_field and creates no user [AC-FR-IAM-001-4, RF-36]'
  )
    .with([
      { member: 'status', value: 'active' },
      { member: 'email_verified_at', value: '2026-11-23T00:00:00.000Z' },
      { member: 'security_stamp', value: '00000000-0000-4000-8000-000000000000' },
      { member: 'role', value: 'platform_admin' },
      { member: 'is_staff', value: true },
    ])
    .run(async ({ assert }, { member, value }) => {
      const body = signUpBody('t-sec-003', { [member]: value })
      const response = await postJson(client, SIGN_UP_PATH, body)
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        response.body.errors.map((item: { field: string; code: string }) => [
          item.field,
          item.code,
        ]),
        [[member, 'unknown_field']]
      )
      assert.isNull(await userByEmail(body.email))
      assert.lengthOf(await queued('notifications.dispatch'), 0)
    })

  test('T-SEC-003 a created account has the default status, verification, stamp and no staff role [AC-FR-IAM-001-4]', async ({
    assert,
  }) => {
    const body = signUpBody('t-sec-003-defaults')
    assert.equal(await statusOf(postJson(client, SIGN_UP_PATH, body)), 202)
    const user = await userByEmail(body.email)
    assert.equal(user.status, 'pending_verification')
    assert.isNull(user.email_verified_at)
    assert.match(user.security_stamp, /^[0-9a-f-]{36}$/)
    assert.isNull(user.mfa_enabled_at)
    assert.isNull(await db.from('platform_staff').where('user_id', user.id).first())
  })
})

test.group('T-SEC-012 sign-up does not tell whether an email is registered', (group) => {
  let client: Guest
  let emails: ReturnType<typeof captureEmails>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    client = await guest()
    emails = captureEmails()
    return async () => {
      emails.restore()
      await forgetSignUp(client.ip)
    }
  })

  test('T-SEC-012 a registered email gets the same status and body, and each branch spends one hash and queues one email [AC-FR-IAM-001-2, AC-J04-02]', async ({
    assert,
  }) => {
    const body = signUpBody('t-sec-012')
    const fresh = await countingHashes(() => postJson(client, SIGN_UP_PATH, body))
    const known = await countingHashes(() =>
      postJson(client, SIGN_UP_PATH, { ...body, full_name: 'Someone Else' })
    )
    assert.equal(fresh.calls, 1)
    assert.equal(known.calls, 1)
    assert.equal(known.result.status, fresh.result.status)
    assert.equal(known.result.status, 202)
    assert.deepEqual(known.result.body, fresh.result.body)
    assert.equal(known.result.headers.get('content-type'), fresh.result.headers.get('content-type'))

    // One account, its first token untouched, one notice job for the second call.
    const user = await userByEmail(body.email)
    assert.equal(user.full_name, 'Sita Shrestha')
    assert.lengthOf(await db.from('users').where('email', body.email), 1)
    const tokens = await db.from('user_tokens').where('user_id', user.id)
    assert.lengthOf(tokens, 1)
    assert.isNull(tokens[0].consumed_at)
    const jobs = await dispatchJobsFor(user.id)
    assert.sameMembers(
      jobs.map((job) => job.data.event),
      ['user_token.issued', 'user.signup_attempted']
    )
    assert.lengthOf(await auditRows(user.id, 'user.signup'), 1)
  })

  test('T-IAM-104 Ram@ then ram@: the same 202 body, one users row, and the account-exists email for the holder', async ({
    assert,
  }) => {
    const base = signUpBody('t-iam-104')
    const mixed = `Ram.${base.email.toUpperCase()}`
    const lower = mixed.toLowerCase()
    const first = await postJson(client, SIGN_UP_PATH, { ...base, email: mixed })
    const second = await postJson(client, SIGN_UP_PATH, { ...base, email: lower })
    assert.equal(first.status, 202)
    assert.equal(second.status, 202)
    assert.deepEqual(second.body, first.body)
    const rows = await db.from('users').where('email', lower)
    assert.lengthOf(rows, 1)
    assert.equal(rows[0].email, lower)

    const jobs = await dispatchJobsFor(rows[0].id)
    const notice = jobs.find((job) => job.data.event === 'user.signup_attempted')
    assert.isDefined(notice)
    assert.equal(notice!.data.user_id, rows[0].id)
    const sent = await deliver(notice!.data as NoticeDispatch)
    assert.equal(sent.kind, 'sent')
    const [message] = emails.fake.sent
    assert.equal(message.to, lower)
    assert.equal(message.template, 'identity.account_exists')
    assert.equal(message.subject, 'Someone tried to sign up with your email')
    const link = linkIn(message.text)
    assert.equal(link.origin, new URL(appUrl).origin)
    assert.equal(link.pathname, '/login')
    // No token: the notice signs nobody in and verifies nothing.
    assert.equal(link.search, '')
    assert.isNull(await liveToken(rows[0].id, 'password_reset'))
  })
})
