import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { updateMe } from '#modules/identity/actions/update_me'
import { phoneBlindIndex } from '#modules/platform/crypto/blind_index'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { signIn } from '#tests/support/courier_http'
import {
  ME_PATH,
  forgetKeys,
  getJson,
  guest,
  patchJson,
  randomIPv4,
  type Guest,
} from '#tests/support/identity'

/*
 * `updateMe` over HTTP and through the action (docs/06 §13.3; 01
 * FR-IAM-013, AC-FR-IAM-002-2; 02 J-04 step 7; M1 part 6a). Sessions are
 * started with the test sign-in route (`startSession`, as `logIn` does).
 * - T-IAM-007: a name, a mobile number and the consents answer 200 with
 *   the account as `getMe` has it; the name is kept trimmed and in NFC; an
 *   absent member keeps its column; `phone: null` removes the number, and
 *   so does `""`, which the body parser reads as null; a changed or removed
 *   number clears `phone_verified_at`; a granted consent keeps its first
 *   time when sent again; each grant or
 *   withdrawal writes one `user.consent_change` row with the source
 *   `account_page` and the columns by name, and a request that changes no
 *   consent writes none; a `pending_verification` user may edit; a name or
 *   mobile out of rule, a consent that is not a boolean, and a null or
 *   empty name or consent answer 422 and write nothing; a guest gets 401; a
 *   stamp rotated or a suspension
 *   between the account check and the write answers 401 or 403 and writes
 *   nothing.
 * - T-IAM-103: after `updateMe` the row holds the phone only as ciphertext,
 *   blind index and last four digits, and the blind index finds the user.
 * - T-SEC-003: `email`, `status`, `security_stamp`, a password, a role or
 *   an encrypted column answer 422 `unknown_field` and change nothing.
 * - T-SEC-102: the consent row holds no name, email or phone.
 * Each call charges the user's `profile_update` key, which the limiter
 * store commits on its own connection, so each test deletes the keys of the
 * users it made (docs/10 §3.3); the limit itself is in
 * tests/concurrency/identity/account_deletion.spec.ts (T-SEC-011).
 */

const userRow = (userId: string) => db.from('users').where('id', userId).firstOrFail()
const consentRows = (userId: string) =>
  db.from('audit_logs').where({ action: 'user.consent_change', subject_id: userId }).orderBy('id')

const problemFields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// The users this file signed in, whose `profile_update` keys each test deletes.
const made: string[] = []

async function forgetMade() {
  for (const id of made.splice(0)) await forgetKeys('profile_update', id)
}

async function signedIn(state?: 'pending_verification') {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  await user.refresh()
  made.push(user.id)
  const client: Guest = { browser: await signIn(user.id), ip: randomIPv4() }
  return { user, client }
}

test.group('T-IAM-007 updateMe', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-007 a name, a mobile number and the consents answer 200 with the account as getMe has it [AC-FR-IAM-013-1, AC-J04-05]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const response = await patchJson(client, ME_PATH, {
      full_name: '  Rama Thapa  ',
      phone: '+977 984-123-4567',
      marketing_email_consent: true,
      marketing_sms_consent: false,
    })
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body.data, {
      id: user.id,
      email: user.email,
      full_name: 'Rama Thapa',
      status: 'active',
      phone_last4: '4567',
      marketing_email_consent: true,
      marketing_sms_consent: false,
      staff_role: null,
      shops: [],
    })
    const me = await getJson(client, ME_PATH)
    assert.deepEqual(me.body.data, response.body.data)

    const row = await userRow(user.id)
    assert.equal(row.full_name, 'Rama Thapa')
    assert.equal(decryptField(row.phone_enc, 'users.phone_enc'), '+9779841234567')
    assert.instanceOf(row.marketing_email_consent_at, Date)
    assert.isNull(row.marketing_sms_consent_at)
  })

  test('T-IAM-007 the name is stored in NFC, counted in code points', async ({ assert }) => {
    const { user, client } = await signedIn()
    // "a" and a combining acute accent: NFC composes them into one code point.
    const decomposed = 'Ra\u0301m'
    const response = await patchJson(client, ME_PATH, { full_name: decomposed })
    assert.equal(response.status, 200, response.text)
    const row = await userRow(user.id)
    assert.equal(row.full_name, decomposed.normalize('NFC'))
    assert.equal(row.full_name, 'Rám')
  })

  test('T-IAM-007 an absent member keeps its column, and an empty body changes nothing', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await patchJson(client, ME_PATH, { phone: '9851234567', marketing_sms_consent: true })
    const before = await userRow(user.id)

    const named = await patchJson(client, ME_PATH, { full_name: 'Gita Rai' })
    assert.equal(named.status, 200, named.text)
    const after = await userRow(user.id)
    assert.equal(after.full_name, 'Gita Rai')
    assert.equal(after.phone_enc, before.phone_enc)
    assert.deepEqual(after.marketing_sms_consent_at, before.marketing_sms_consent_at)

    const empty = await patchJson(client, ME_PATH, {})
    assert.equal(empty.status, 200, empty.text)
    assert.deepEqual(await userRow(user.id), after)
  })

  test('T-IAM-007 phone null removes the number, its blind index and its last four digits', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await patchJson(client, ME_PATH, { phone: '9851234567' })
    const response = await patchJson(client, ME_PATH, { phone: null })
    assert.equal(response.status, 200, response.text)
    assert.isNull(response.body.data.phone_last4)
    const row = await userRow(user.id)
    assert.isNull(row.phone_enc)
    assert.isNull(row.phone_hash)
    assert.isNull(row.phone_last4)
  })

  test('T-IAM-007 an empty phone, which the body parser reads as null, removes the number too', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await patchJson(client, ME_PATH, { phone: '9851234567' })
    const response = await patchJson(client, ME_PATH, { phone: '' })
    assert.equal(response.status, 200, response.text)
    assert.isNull(response.body.data.phone_last4)
    const row = await userRow(user.id)
    assert.isNull(row.phone_enc)
    assert.isNull(row.phone_last4)
  })

  test('T-IAM-007 a changed or removed number clears phone_verified_at [FR-IAM-010]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await patchJson(client, ME_PATH, { phone: '9851234567' })
    const verify = () =>
      db
        .from('users')
        .where('id', user.id)
        .update({ phone_verified_at: db.raw('now()') })

    await verify()
    const changed = await patchJson(client, ME_PATH, { phone: '9861234567' })
    assert.equal(changed.status, 200, changed.text)
    const afterChange = await userRow(user.id)
    assert.isNull(afterChange.phone_verified_at)

    await verify()
    const removed = await patchJson(client, ME_PATH, { phone: null })
    assert.equal(removed.status, 200, removed.text)
    const afterRemoval = await userRow(user.id)
    assert.isNull(afterRemoval.phone_verified_at)

    // A request that leaves the phone alone leaves its verification alone.
    await patchJson(client, ME_PATH, { phone: '9861234567' })
    await verify()
    await patchJson(client, ME_PATH, { full_name: 'Kept Verified' })
    const untouched = await userRow(user.id)
    assert.instanceOf(untouched.phone_verified_at, Date)
  })

  test('T-IAM-007 a consent sent again keeps its first time; each grant and withdrawal writes one row by name [AC-FR-IAM-013-4]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const grant = await patchJson(client, ME_PATH, { marketing_email_consent: true })
    assert.equal(grant.status, 200, grant.text)
    const granted = await userRow(user.id)
    assert.instanceOf(granted.marketing_email_consent_at, Date)
    // `now()` is the test transaction's start, so the first opt-in is moved back a day: a
    // repeat that wrote `now()` again would then show.
    await db
      .from('users')
      .where('id', user.id)
      .update({ marketing_email_consent_at: db.raw(`now() - interval '1 day'`) })
    const moved = await userRow(user.id)
    const first = moved.marketing_email_consent_at as Date

    const again = await patchJson(client, ME_PATH, {
      full_name: 'Sita Shrestha',
      marketing_email_consent: true,
      marketing_sms_consent: false,
    })
    assert.equal(again.status, 200, again.text)
    const kept = await userRow(user.id)
    assert.deepEqual(kept.marketing_email_consent_at, first)

    const withdraw = await patchJson(client, ME_PATH, {
      marketing_email_consent: false,
      marketing_sms_consent: true,
    })
    assert.equal(withdraw.status, 200, withdraw.text)
    const row = await userRow(user.id)
    assert.isNull(row.marketing_email_consent_at)
    assert.instanceOf(row.marketing_sms_consent_at, Date)

    const audits = await consentRows(user.id)
    assert.lengthOf(audits, 2)
    assert.include(audits[0], {
      actor_type: 'customer',
      actor_user_id: user.id,
      subject_type: 'user',
      request_id: grant.headers.get('x-request-id'),
    })
    assert.deepEqual(audits[0].changes, {
      source: 'account_page',
      granted: ['marketing_email_consent_at'],
      withdrawn: [],
    })
    assert.deepEqual(audits[1].changes, {
      source: 'account_page',
      granted: ['marketing_sms_consent_at'],
      withdrawn: ['marketing_email_consent_at'],
    })
    assert.isNotNull(audits[1].ip_hash)
  })

  test('T-SEC-102 the consent row holds no name, email or phone of the account', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await patchJson(client, ME_PATH, {
      full_name: 'Maya Gurung',
      phone: '9861234567',
      marketing_email_consent: true,
    })
    const [audit] = await consentRows(user.id)
    const written = JSON.stringify(audit)
    for (const value of ['Maya Gurung', user.email, '9861234567']) {
      assert.notInclude(written, value)
    }
  })

  test('T-IAM-007 a pending_verification user may edit the profile [AC-FR-IAM-002-2]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn('pending_verification')
    const response = await patchJson(client, ME_PATH, { full_name: 'Hari Bista' })
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.status, 'pending_verification')
    const row = await userRow(user.id)
    assert.equal(row.full_name, 'Hari Bista')
  })

  test('T-IAM-007 {label} answers 422 on {field} and writes nothing')
    .with([
      { label: 'an empty name', field: 'full_name', body: { full_name: '   ' } },
      {
        label: 'a name of 101 code points',
        field: 'full_name',
        body: { full_name: 'a'.repeat(101) },
      },
      { label: 'a null name', field: 'full_name', body: { full_name: null } },
      { label: 'an empty name, read as null', field: 'full_name', body: { full_name: '' } },
      {
        label: 'a null email consent',
        field: 'marketing_email_consent',
        body: { marketing_email_consent: null },
      },
      {
        label: 'a null SMS consent',
        field: 'marketing_sms_consent',
        body: { marketing_sms_consent: null },
      },
      { label: 'an IoT number', field: 'phone', body: { phone: '9012345678' } },
      { label: 'a landline', field: 'phone', body: { phone: '014123456' } },
      {
        label: 'a consent of "on"',
        field: 'marketing_email_consent',
        body: { marketing_email_consent: 'on' },
      },
    ])
    .run(async ({ assert }, { field, body }) => {
      const { user, client } = await signedIn()
      const before = await userRow(user.id)
      const response = await patchJson(client, ME_PATH, { marketing_sms_consent: true, ...body })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(
        problemFields(response.body).map(([name]) => name),
        [field]
      )
      assert.deepEqual(await userRow(user.id), before)
      assert.lengthOf(await consentRows(user.id), 0)
    })

  test('T-IAM-007 a guest gets 401', async ({ assert }) => {
    const response = await patchJson(await guest(), ME_PATH, { full_name: 'Nobody' })
    assert.equal(response.status, 401, response.text)
    assert.equal(response.body.code, 'UNAUTHENTICATED')
  })

  test('T-IAM-007 a stamp rotated or a suspension after the account check answers 401 or 403 and writes nothing', async ({
    assert,
  }) => {
    const { user } = await signedIn()
    const command = { fullName: 'Changed Name', sessionStamp: user.securityStamp }
    const context = { requestId: null, ipHash: null }

    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    const stale = await updateMe(user.id, command, context).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(stale, DomainError)
    assert.equal((stale as DomainError).problemCode, 'UNAUTHENTICATED')

    const fresh = await userRow(user.id)
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const suspended = await updateMe(
      user.id,
      { ...command, sessionStamp: String(fresh.security_stamp) },
      context
    ).then(
      () => null,
      (error) => error
    )
    assert.instanceOf(suspended, DomainError)
    assert.equal((suspended as DomainError).problemCode, 'ACCOUNT_SUSPENDED')
    const unchanged = await userRow(user.id)
    assert.notEqual(unchanged.full_name, 'Changed Name')
  })
})

test.group('T-IAM-103 the phone written by updateMe', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-103 after updateMe the users row holds the phone only as ciphertext, blind index and last four digits', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const response = await patchJson(client, ME_PATH, { phone: '09721234567' })
    assert.equal(response.status, 200, response.text)
    const row = await userRow(user.id)
    const raw = JSON.stringify({ ...row, phone_hash: row.phone_hash.toString('hex') })
    for (const form of ['9721234567', '+9779721234567', '972123456']) {
      assert.notInclude(raw, form)
    }
    assert.match(row.phone_enc, /^v1\.[A-Za-z0-9_-]+\./)
    assert.equal(row.phone_last4, '4567')
    const found = await db
      .from('users')
      .where('phone_hash', phoneBlindIndex('+9779721234567'))
      .select('id')
    assert.include(
      found.map((found_row) => found_row.id),
      user.id
    )
  })
})

test.group('T-SEC-003 server-owned fields on updateMe', (group) => {
  group.each.teardown(forgetMade)

  test(
    'T-SEC-003 updateMe with {member} is refused with 422 unknown_field and changes nothing [RF-36]'
  )
    .with([
      { member: 'email', value: 'someone-else@example.com' },
      { member: 'status', value: 'active' },
      { member: 'security_stamp', value: '00000000-0000-4000-8000-000000000000' },
      { member: 'password', value: 'a-new-password-1' },
      { member: 'staff_role', value: 'platform_admin' },
      { member: 'phone_enc', value: 'v1.k.AAAAAAAAAAAAAAAA.AA.AAAAAAAAAAAAAAAAAAAAAA' },
      { member: 'email_verified_at', value: '2026-11-23T00:00:00.000Z' },
    ])
    .run(async ({ assert }, { member, value }) => {
      const { user, client } = await signedIn()
      const before = await userRow(user.id)
      const response = await patchJson(client, ME_PATH, { full_name: 'Not Saved', [member]: value })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[member, 'unknown_field']])
      assert.deepEqual(await userRow(user.id), before)
    })
})
