import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { toProblem } from '#exceptions/to_problem'
import { createAddress, type CreateAddressCommand } from '#modules/identity/actions/create_address'
import { deleteAddress } from '#modules/identity/actions/delete_address'
import { updateAddress } from '#modules/identity/actions/update_address'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { signIn } from '#tests/support/courier_http'
import { CIPHERTEXT, refused } from '#tests/support/schema_rows'
import {
  deleteJson,
  forgetKeys,
  getJson,
  guest,
  patchJson,
  postJson,
  randomIPv4,
  type Guest,
} from '#tests/support/identity'

/*
 * The address book over HTTP and through its actions (docs/06 §13.4
 * `listAddresses`, `createAddress`, `updateAddress`, `deleteAddress`; 01
 * FR-IAM-012; docs/04a §5.5; M1 part 6b). Sessions are started with the
 * test sign-in route (`startSession`, as `logIn` does). Places are real
 * rows of the seeded reference data: Kathmandu Metropolitan City (province
 * 3, district 306, local level 30608), Lalitpur Metropolitan City (308,
 * 30802) and Pokhara Metropolitan City (province 4, district 405, 40504).
 * - T-IAM-009, the operations: the list holds the caller's active addresses, the
 *   default first, with the phone as its last four digits only; a write
 *   answers the address with exactly the transformer's members; text is
 *   trimmed and in NFC; the phone is stored in E.164 whatever its typed
 *   form, a landline or another range is refused, and the same number may
 *   be on two users' addresses; the ward is bounded by 1–40, then by the
 *   local level's `ward_count`; an unknown or inactive local level is
 *   refused; an update is partial, `label` and `street_landmark` may be
 *   cleared and the other members may not; a delete archives; a stale
 *   session stamp or a suspension after the account check writes nothing.
 * - T-SEC-006: another user's or an archived address answers 404 with the
 *   body of a missing ID and changes nothing; a non-UUID ID is 404.
 * - T-SEC-003: `user_id`, `postal_code`, `archived_at` or an encrypted
 *   column is refused with 422 `unknown_field` and writes nothing.
 * - T-SEC-013: an unsafe call without `X-XSRF-TOKEN` is 403.
 * - T-IAM-103: the raw row holds no plaintext name, phone, area or landmark.
 * - T-IAM-107: the first address is the default whatever `is_default` says;
 *   `is_default: true` moves the default; `false` on the default is 422
 *   `default_required`; archiving the default promotes the most recently
 *   created remaining address; the 11th active address is 422
 *   `address_limit` and archived ones do not count. The races are in
 *   tests/concurrency/identity/address_book.spec.ts.
 * - T-IAM-108: a district of another province or a local level of another
 *   district is 422 `location_mismatch` with nothing written; a direct
 *   insert of such a chain gets 23503 from the composite keys, which the
 *   problem mapper answers as 500 `INTERNAL`.
 * Every address call charges the user's `api_user` key (docs/06 §9.1),
 * which the limiter store commits on its own connection, so each test
 * deletes the keys of the users it made (docs/10 §3.3).
 *
 * Every functional test runs in one transaction, so `now()`, and with it
 * `created_at`, is the same for every row a test writes; a test whose
 * outcome depends on the creation order sets distinct times first.
 */

const ADDRESSES = '/api/v1/me/addresses'
const addressPath = (id: string) => `${ADDRESSES}/${id}`

// The members of app/transformers/identity/address_transformer.ts, and nothing else.
const ADDRESS_MEMBERS = [
  'id',
  'label',
  'recipient_name',
  'recipient_phone_last4',
  'province_code',
  'province_name',
  'district_code',
  'district_name',
  'local_level_code',
  'local_level_name',
  'ward_no',
  'area_tole',
  'street_landmark',
  'postal_code',
  'is_default',
]

const KATHMANDU = { province_code: '3', district_code: '306', local_level_code: '30608' }
const POKHARA = { province_code: '4', district_code: '405', local_level_code: '40504' }

type Address = Record<string, unknown> & { id: string; is_default: boolean }

// A valid `createAddress` body in Kathmandu; `overrides` replaces or adds members.
function addressBody(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Home',
    recipient_name: 'Sita Shrestha',
    recipient_phone: '9841234567',
    ...KATHMANDU,
    ward_no: 5,
    area_tole: 'Thamel',
    street_landmark: 'Near the Garden of Dreams',
    ...overrides,
  }
}

// A `createAddress` command for the action, in Kathmandu.
function command(
  user: { securityStamp: string },
  overrides: Partial<CreateAddressCommand> = {}
): CreateAddressCommand {
  return {
    label: null,
    recipientName: 'Sita Shrestha',
    recipientPhoneE164: '+9779841234567',
    place: { provinceCode: '3', districtCode: '306', localLevelCode: '30608', wardNo: 5 },
    areaTole: 'Thamel',
    streetLandmark: null,
    isDefault: false,
    sessionStamp: user.securityStamp,
    ...overrides,
  }
}

const rowsOf = (userId: string) =>
  db.from('user_addresses').where('user_id', userId).orderBy('created_at').orderBy('id')
const activeOf = (userId: string) =>
  db.from('user_addresses').where('user_id', userId).whereNull('archived_at').orderBy('id')
const rowOf = (id: string) => db.from('user_addresses').where('id', id).firstOrFail()

async function defaultIds(userId: string) {
  const rows = await activeOf(userId).where('is_default', true)
  return rows.map((row) => row.id as string)
}

async function wardCountOf(localLevelCode: string) {
  const row = await db.from('local_levels').where('code', localLevelCode).firstOrFail()
  return Number(row.ward_count)
}

// Moves an address's creation time back by `minutes`, so tests can set the creation order.
async function createdMinutesAgo(id: string, minutes: number) {
  await db
    .from('user_addresses')
    .where('id', id)
    .update({ created_at: db.raw('now() - make_interval(mins => ?::int)', [minutes]) })
}

const problemFields = (body: { errors?: { field: string | null; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

// A problem body without its `request_id`, which differs per request.
function withoutRequestId(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([member]) => member !== 'request_id'))
}

const refusal = (call: () => Promise<unknown>) =>
  call().then(
    () => null,
    (error: unknown) => error
  )

// The users this file signed in, whose `api_user` keys each test deletes.
const made: string[] = []

async function forgetMade() {
  for (const id of made.splice(0)) await forgetKeys('api_user', id)
}

async function signedIn(state?: 'pending_verification') {
  const user = state ? await UserFactory.apply(state).create() : await UserFactory.create()
  await user.refresh()
  made.push(user.id)
  const client: Guest = { browser: await signIn(user.id), ip: randomIPv4() }
  return { user, client }
}

function create(client: Guest, overrides: Record<string, unknown> = {}) {
  return postJson(client, ADDRESSES, addressBody(overrides))
}

// Creates an address over HTTP and answers it; anything but 201 fails the test.
async function created(client: Guest, overrides: Record<string, unknown> = {}) {
  const response = await create(client, overrides)
  if (response.status !== 201) {
    throw new Error(`createAddress answered ${response.status}: ${response.text}`)
  }
  return response.body.data as Address
}

test.group('T-IAM-009 listAddresses and createAddress', (group) => {
  group.each.teardown(forgetMade)

  test("T-SEC-006 listAddresses answers only the caller's active addresses, the default first, with the transformer's members", async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const other = await signedIn()
    const first = await created(client, { label: 'Home' })
    const second = await created(client, { label: 'Office' })
    const third = await created(client, { label: 'Parents' })
    await created(other.client, { label: 'Not mine' })
    await createdMinutesAgo(first.id, 3)
    await createdMinutesAgo(second.id, 2)
    await createdMinutesAgo(third.id, 1)

    const removed = await deleteJson(client, addressPath(second.id))
    assert.equal(removed.status, 204, removed.text)
    const moved = await patchJson(client, addressPath(third.id), { is_default: true })
    assert.equal(moved.status, 200, moved.text)

    const response = await getJson(client, ADDRESSES)
    assert.equal(response.status, 200, response.text)
    assert.sameMembers(Object.keys(response.body), ['data'])
    const data = response.body.data as Address[]
    assert.deepEqual(
      data.map((address) => [address.id, address.label, address.is_default]),
      [
        [third.id, 'Parents', true],
        [first.id, 'Home', false],
      ]
    )
    for (const address of data) assert.sameMembers(Object.keys(address), ADDRESS_MEMBERS)
  })

  test('T-IAM-009 listAddresses and the writes show the recipient phone as its last four digits only [AC-FR-IAM-012-5]', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const createResponse = await create(client, { recipient_phone: '9841234567' })
    assert.equal(createResponse.status, 201, createResponse.text)
    const id = createResponse.body.data.id as string
    assert.equal(createResponse.body.data.recipient_phone_last4, '4567')

    const updateResponse = await patchJson(client, addressPath(id), {
      recipient_phone: '+977 985-765-4321',
    })
    assert.equal(updateResponse.status, 200, updateResponse.text)
    assert.equal(updateResponse.body.data.recipient_phone_last4, '4321')

    const list = await getJson(client, ADDRESSES)
    assert.equal(list.status, 200, list.text)
    for (const response of [createResponse, updateResponse, list]) {
      for (const full of ['9841234567', '+9779841234567', '9857654321', '+9779857654321']) {
        assert.notInclude(response.text, full)
      }
      assert.notInclude(response.text, '"recipient_phone"')
      assert.notInclude(response.text, '_enc')
    }
  })

  test('T-IAM-009 createAddress answers 201 with the address, its text trimmed and in NFC, its place named from the reference data [AC-FR-IAM-012-1]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const response = await create(client, {
      label: '  Home  ',
      // "a" and a combining acute accent: NFC composes them into one code point.
      recipient_name: '  Ra\u0301m Thapa  ',
      area_tole: '  Thamel  ',
      street_landmark: '  Near the Garden of Dreams  ',
      ward_no: 5,
    })
    assert.equal(response.status, 201, response.text)
    assert.sameMembers(Object.keys(response.body), ['data'])
    assert.isNull(response.headers.get('location'))

    const rows = await rowsOf(user.id)
    assert.lengthOf(rows, 1)
    const [row] = rows
    assert.deepEqual(response.body.data, {
      id: row.id,
      label: 'Home',
      recipient_name: 'R\u00E1m Thapa',
      recipient_phone_last4: '4567',
      province_code: '3',
      province_name: 'Bagmati',
      district_code: '306',
      district_name: 'Kathmandu',
      local_level_code: '30608',
      local_level_name: 'Kathmandu Metropolitan City',
      ward_no: 5,
      area_tole: 'Thamel',
      street_landmark: 'Near the Garden of Dreams',
      postal_code: '3060805',
      is_default: true,
    })
    assert.equal(row.label, 'Home')
    assert.equal(
      decryptField(row.recipient_name_enc, 'user_addresses.recipient_name_enc'),
      'R\u00E1m Thapa'
    )
    assert.equal(decryptField(row.area_tole_enc, 'user_addresses.area_tole_enc'), 'Thamel')
    assert.equal(
      decryptField(row.street_landmark_enc, 'user_addresses.street_landmark_enc'),
      'Near the Garden of Dreams'
    )
    assert.isNull(row.archived_at)
  })

  test('T-IAM-009 createAddress without a label or landmark keeps them empty', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const body = addressBody()
    const response = await postJson(client, ADDRESSES, {
      recipient_name: body.recipient_name,
      recipient_phone: body.recipient_phone,
      ...KATHMANDU,
      ward_no: 7,
      area_tole: body.area_tole,
    })
    assert.equal(response.status, 201, response.text)
    assert.isNull(response.body.data.label)
    assert.isNull(response.body.data.street_landmark)
    assert.isTrue(response.body.data.is_default)
    const [row] = await rowsOf(user.id)
    assert.isNull(row.label)
    assert.isNull(row.street_landmark_enc)
  })

  test(
    'T-IAM-009 createAddress stores the recipient phone typed as {input} in E.164 [AC-FR-IAM-012-3]'
  )
    .with([
      { input: '9841234567', e164: '+9779841234567' },
      { input: '+977 9851234567', e164: '+9779851234567' },
      { input: '+977 986-123-4567', e164: '+9779861234567' },
      { input: '972 123 4567', e164: '+9779721234567' },
      { input: '09761234567', e164: '+9779761234567' },
    ])
    .run(async ({ assert }, { input, e164 }) => {
      const { user, client } = await signedIn()
      const response = await create(client, { recipient_phone: input })
      assert.equal(response.status, 201, response.text)
      assert.equal(response.body.data.recipient_phone_last4, e164.slice(-4))
      const [row] = await rowsOf(user.id)
      assert.equal(
        decryptField(row.recipient_phone_enc, 'user_addresses.recipient_phone_enc'),
        e164
      )
      assert.equal(row.recipient_phone_last4, e164.slice(-4))
    })

  test(
    'createAddress refuses {label} with 422 nepal_mobile on recipient_phone and writes nothing [AC-FR-IAM-012-3]'
  )
    .with([
      { label: 'a landline', phone: '014123456' },
      { label: 'a number in the 95 range', phone: '9512345678' },
      { label: 'a number in the 90 range', phone: '9012345678' },
      { label: 'nine digits', phone: '984123456' },
    ])
    .run(async ({ assert }, { phone }) => {
      const { user, client } = await signedIn()
      const response = await create(client, { recipient_phone: phone })
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(problemFields(response.body), [['recipient_phone', 'nepal_mobile']])
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test("T-IAM-009 createAddress allows the same recipient phone on two users' addresses [AC-FR-IAM-012-3]", async ({
    assert,
  }) => {
    const first = await signedIn()
    const second = await signedIn()
    const one = await create(first.client, { recipient_phone: '9841234567' })
    assert.equal(one.status, 201, one.text)
    const two = await create(second.client, { recipient_phone: '+9779841234567' })
    assert.equal(two.status, 201, two.text)
    const [firstRow] = await rowsOf(first.user.id)
    const [secondRow] = await rowsOf(second.user.id)
    for (const row of [firstRow, secondRow]) {
      assert.equal(
        decryptField(row.recipient_phone_enc, 'user_addresses.recipient_phone_enc'),
        '+9779841234567'
      )
    }
  })

  test('T-IAM-009 createAddress refuses {label} with 422 on {field} and writes nothing')
    .with([
      { label: 'a blank recipient name', field: 'recipient_name', body: { recipient_name: '   ' } },
      {
        label: 'a recipient name of 101 code points',
        field: 'recipient_name',
        body: { recipient_name: 'a'.repeat(101) },
      },
      { label: 'an area of one character', field: 'area_tole', body: { area_tole: 'a' } },
      { label: 'a label of 31 characters', field: 'label', body: { label: 'a'.repeat(31) } },
      { label: 'a missing ward', field: 'ward_no', body: { ward_no: undefined } },
      { label: 'a ward sent as a string', field: 'ward_no', body: { ward_no: '5' } },
      { label: 'a ward of 2.5', field: 'ward_no', body: { ward_no: 2.5 } },
      { label: 'a province sent as a number', field: 'province_code', body: { province_code: 3 } },
      {
        label: 'a free-text district',
        field: 'district_code',
        body: { district_code: 'Kathmandu' },
      },
      {
        label: 'a free-text local level',
        field: 'local_level_code',
        body: { local_level_code: 'Kathmandu Metropolitan City' },
      },
      { label: 'is_default of "yes"', field: 'is_default', body: { is_default: 'yes' } },
      { label: 'a null is_default', field: 'is_default', body: { is_default: null } },
    ])
    .run(async ({ assert }, { field, body }) => {
      const { user, client } = await signedIn()
      const response = await create(client, body)
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(
        problemFields(response.body).map(([name]) => name),
        [field]
      )
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test(
    'T-IAM-009 createAddress refuses a ward of {ward} with 422 range on ward_no [AC-FR-IAM-012-2]'
  )
    .with([{ ward: 0 }, { ward: 41 }])
    .run(async ({ assert }, { ward }) => {
      const { user, client } = await signedIn()
      const response = await create(client, { ward_no: ward })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [['ward_no', 'range']])
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test("T-IAM-009 createAddress bounds the ward by the local level's ward_count: one more is 422 ward_out_of_range [AC-FR-IAM-012-2]", async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const wardCount = await wardCountOf('30608')
    assert.isBelow(wardCount, 40, 'the case needs a local level with fewer than 40 wards')

    const beyond = await create(client, { ward_no: wardCount + 1 })
    assert.equal(beyond.status, 422, beyond.text)
    assert.equal(beyond.body.code, 'VALIDATION_FAILED')
    assert.deepEqual(problemFields(beyond.body), [['ward_no', 'ward_out_of_range']])
    assert.lengthOf(await rowsOf(user.id), 0)

    const last = await create(client, { ward_no: wardCount })
    assert.equal(last.status, 201, last.text)
    assert.equal(last.body.data.ward_no, wardCount)
    assert.equal(last.body.data.postal_code, `30608${String(wardCount).padStart(2, '0')}`)
  })

  test('T-IAM-009 createAddress refuses a local level that does not exist or is no longer active with location_mismatch [AC-FR-IAM-012-1]', async ({
    assert,
  }) => {
    // A test row, rolled back with the test; 30699 is not a seeded code.
    await db.table('local_levels').insert({
      code: '30699',
      district_code: '306',
      name_en: 'Test Retired Municipality',
      name_ne: 'परीक्षण नगरपालिका',
      type: 'municipality',
      ward_count: 9,
      is_active: false,
    })
    const { user, client } = await signedIn()
    for (const code of ['30699', '30698']) {
      const response = await create(client, { local_level_code: code })
      assert.equal(response.status, 422, `${code}: ${response.text}`)
      assert.deepEqual(problemFields(response.body), [['local_level_code', 'location_mismatch']])
    }
    assert.lengthOf(await rowsOf(user.id), 0)
  })
})

test.group('T-IAM-103 the address row', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-103 the user_addresses row holds no plaintext recipient name, phone, area or landmark [AC-FR-IAM-012-5]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    await created(client, {
      recipient_name: 'Maya Gurung',
      recipient_phone: '986 123 4567',
      area_tole: 'Lazimpat Marg',
      street_landmark: 'Opposite the embassy gate',
    })
    const [row] = await rowsOf(user.id)
    const raw = JSON.stringify(row)
    for (const plain of [
      'Maya Gurung',
      '9861234567',
      '+9779861234567',
      '986 123 4567',
      'Lazimpat Marg',
      'Opposite the embassy gate',
    ]) {
      assert.notInclude(raw, plain)
    }
    for (const column of [
      'recipient_name_enc',
      'recipient_phone_enc',
      'area_tole_enc',
      'street_landmark_enc',
    ]) {
      assert.match(row[column], /^v1\.[A-Za-z0-9_-]+\./, column)
    }
    assert.equal(row.recipient_phone_last4, '4567')
    assert.equal(
      decryptField(row.recipient_phone_enc, 'user_addresses.recipient_phone_enc'),
      '+9779861234567'
    )
    // Each value is sealed for its own column: the phone's ciphertext is not the name's.
    assert.throws(() => decryptField(row.recipient_phone_enc, 'user_addresses.recipient_name_enc'))
  })
})

test.group('T-IAM-108 the location chain', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-108 {label} answers 422 location_mismatch on local_level_code and writes nothing')
    .with([
      {
        label: 'a district of another province',
        place: { province_code: '3', district_code: '405', local_level_code: '40504' },
      },
      {
        label: 'a local level of another district',
        place: { province_code: '3', district_code: '306', local_level_code: '30802' },
      },
      {
        label: "a province that is not the district's",
        place: { province_code: '4', district_code: '306', local_level_code: '30608' },
      },
    ])
    .run(async ({ assert }, { place }) => {
      const { user, client } = await signedIn()
      const response = await create(client, place)
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(problemFields(response.body), [['local_level_code', 'location_mismatch']])
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test('T-IAM-108 updateAddress refuses a district sent without its local level with location_mismatch, and takes a whole new place', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const address = await created(client)
    const before = await rowOf(address.id)

    const district = await patchJson(client, addressPath(address.id), { district_code: '308' })
    assert.equal(district.status, 422, district.text)
    assert.deepEqual(problemFields(district.body), [['local_level_code', 'location_mismatch']])
    const crossed = await patchJson(client, addressPath(address.id), {
      province_code: '4',
      district_code: '405',
      local_level_code: '30608',
    })
    assert.equal(crossed.status, 422, crossed.text)
    assert.deepEqual(problemFields(crossed.body), [['local_level_code', 'location_mismatch']])
    assert.deepEqual(await rowOf(address.id), before)

    const moved = await patchJson(client, addressPath(address.id), { ...POKHARA, ward_no: 8 })
    assert.equal(moved.status, 200, moved.text)
    assert.include(moved.body.data, {
      province_code: '4',
      province_name: 'Gandaki',
      district_code: '405',
      district_name: 'Kaski',
      local_level_code: '40504',
      local_level_name: 'Pokhara Metropolitan City',
      ward_no: 8,
      postal_code: '4050408',
    })
  })

  test('T-IAM-108 a direct insert of {label} gets 23503 from {constraint}')
    .with([
      {
        label: 'a district of another province',
        place: { province_code: '3', district_code: '405', local_level_code: '40504' },
        constraint: 'user_addresses_district_fkey',
      },
      {
        label: 'a local level of another district',
        place: { province_code: '3', district_code: '306', local_level_code: '30802' },
        constraint: 'user_addresses_local_level_fkey',
      },
    ])
    .run(async ({ assert }, { label, place, constraint }) => {
      const user = await UserFactory.create()
      await refused(
        assert,
        (trx) =>
          trx.table('user_addresses').insert({
            user_id: user.id,
            recipient_name_enc: CIPHERTEXT,
            recipient_phone_enc: CIPHERTEXT,
            recipient_phone_last4: '4567',
            ...place,
            ward_no: 1,
            area_tole_enc: CIPHERTEXT,
          }),
        { code: '23503', constraint },
        label
      )
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test('T-IAM-108 the 23503 of the location keys is a backstop that answers 500 INTERNAL', async ({
    assert,
  }) => {
    const user = await UserFactory.create()
    const error = await db
      .transaction((trx) =>
        trx.table('user_addresses').insert({
          user_id: user.id,
          recipient_name_enc: CIPHERTEXT,
          recipient_phone_enc: CIPHERTEXT,
          recipient_phone_last4: '4567',
          province_code: '3',
          district_code: '405',
          local_level_code: '40504',
          ward_no: 1,
          area_tole_enc: CIPHERTEXT,
        })
      )
      .then(
        () => null,
        (e: unknown) => e
      )
    assert.equal((error as { code?: string } | null)?.code, '23503')
    const problem = toProblem(error, 'test-request')
    assert.equal(problem.status, 500)
    assert.equal(problem.code, 'INTERNAL')
    assert.notInclude(JSON.stringify(problem), 'user_addresses')
  })
})

test.group('T-SEC-003 server-owned members of the address writes', (group) => {
  group.each.teardown(forgetMade)

  test('T-SEC-003 createAddress with {member} is refused with 422 unknown_field and writes nothing')
    .with([
      { member: 'user_id', value: '00000000-0000-4000-8000-000000000000' },
      { member: 'postal_code', value: '3060801' },
      { member: 'archived_at', value: '2026-11-23T00:00:00.000Z' },
      { member: 'recipient_phone_enc', value: CIPHERTEXT },
    ])
    .run(async ({ assert }, { member, value }) => {
      const { user, client } = await signedIn()
      const response = await create(client, { [member]: value })
      assert.equal(response.status, 422, response.text)
      assert.equal(response.body.code, 'VALIDATION_FAILED')
      assert.deepEqual(problemFields(response.body), [[member, 'unknown_field']])
      assert.lengthOf(await rowsOf(user.id), 0)
    })

  test(
    'T-SEC-003 updateAddress with {member} is refused with 422 unknown_field and changes nothing'
  )
    .with([
      { member: 'user_id', value: '00000000-0000-4000-8000-000000000000' },
      { member: 'archived_at', value: '2026-11-23T00:00:00.000Z' },
      { member: 'area_tole_enc', value: CIPHERTEXT },
    ])
    .run(async ({ assert }, { member, value }) => {
      const { client } = await signedIn()
      const address = await created(client)
      const before = await rowOf(address.id)
      const response = await patchJson(client, addressPath(address.id), {
        label: 'Not Saved',
        [member]: value,
      })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[member, 'unknown_field']])
      assert.deepEqual(await rowOf(address.id), before)
    })
})

test.group('T-IAM-107 the default address and the cap', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-107 the first address is the default even with is_default false; is_default true on a later one moves it [AC-FR-IAM-012-4]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const first = await created(client, { is_default: false })
    assert.isTrue(first.is_default)
    const second = await created(client, { label: 'Office' })
    assert.isFalse(second.is_default)
    assert.deepEqual(await defaultIds(user.id), [first.id])

    const third = await created(client, { label: 'Parents', is_default: true })
    assert.isTrue(third.is_default)
    assert.deepEqual(await defaultIds(user.id), [third.id])
    const firstRow = await rowOf(first.id)
    assert.isFalse(firstRow.is_default)
  })

  test('T-IAM-107 updateAddress: is_default false on the default is 422 default_required; true on another moves the default', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const first = await created(client)
    const second = await created(client, { label: 'Office' })
    const before = await rowOf(first.id)

    const refusedResponse = await patchJson(client, addressPath(first.id), {
      is_default: false,
      label: 'Not Saved',
    })
    assert.equal(refusedResponse.status, 422, refusedResponse.text)
    assert.equal(refusedResponse.body.code, 'VALIDATION_FAILED')
    assert.deepEqual(problemFields(refusedResponse.body), [['is_default', 'default_required']])
    assert.deepEqual(await rowOf(first.id), before)

    // false on an address that is not the default changes nothing.
    const kept = await patchJson(client, addressPath(second.id), { is_default: false })
    assert.equal(kept.status, 200, kept.text)
    assert.isFalse(kept.body.data.is_default)
    assert.deepEqual(await defaultIds(user.id), [first.id])

    const moved = await patchJson(client, addressPath(second.id), { is_default: true })
    assert.equal(moved.status, 200, moved.text)
    assert.isTrue(moved.body.data.is_default)
    assert.deepEqual(await defaultIds(user.id), [second.id])

    // Making the default the default again changes nothing.
    const again = await patchJson(client, addressPath(second.id), { is_default: true })
    assert.equal(again.status, 200, again.text)
    assert.deepEqual(await defaultIds(user.id), [second.id])
  })

  test('T-IAM-107 deleting the default makes the most recently created remaining address the default', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const first = await created(client, { label: 'First' })
    const second = await created(client, { label: 'Second' })
    const third = await created(client, { label: 'Third' })
    // `second` is the most recently created by its creation time, though `third` was written later.
    await createdMinutesAgo(first.id, 3)
    await createdMinutesAgo(second.id, 1)
    await createdMinutesAgo(third.id, 2)
    assert.deepEqual(await defaultIds(user.id), [first.id])

    const response = await deleteJson(client, addressPath(first.id))
    assert.equal(response.status, 204, response.text)
    const archived = await rowOf(first.id)
    assert.instanceOf(archived.archived_at, Date)
    assert.isFalse(archived.is_default)
    assert.deepEqual(await defaultIds(user.id), [second.id])
  })

  test('T-IAM-107 deleting an address that is not the default leaves the default where it is', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const first = await created(client)
    const second = await created(client, { label: 'Office' })
    const response = await deleteJson(client, addressPath(second.id))
    assert.equal(response.status, 204, response.text)
    assert.deepEqual(await defaultIds(user.id), [first.id])
  })

  test('T-IAM-107 the 11th active address is 422 address_limit; an archived address does not count [AC-FR-IAM-012-4]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    for (let n = 0; n < 10; n++) {
      await createAddress(user.id, command(user, { label: `Address ${n + 1}` }))
    }
    assert.lengthOf(await activeOf(user.id), 10)

    const eleventh = await create(client, { label: 'Eleventh' })
    assert.equal(eleventh.status, 422, eleventh.text)
    assert.equal(eleventh.body.code, 'VALIDATION_FAILED')
    assert.deepEqual(problemFields(eleventh.body), [[null, 'address_limit']])
    assert.lengthOf(await rowsOf(user.id), 10)

    const [oldest] = await activeOf(user.id)
    const removed = await deleteJson(client, addressPath(oldest.id))
    assert.equal(removed.status, 204, removed.text)
    const again = await create(client, { label: 'Eleventh' })
    assert.equal(again.status, 201, again.text)
    assert.lengthOf(await activeOf(user.id), 10)
    assert.lengthOf(await rowsOf(user.id), 11)
    assert.lengthOf(await defaultIds(user.id), 1)
  })
})

test.group('T-IAM-009 updateAddress', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-009 updateAddress changes only the members sent; an empty body changes nothing', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const address = await created(client)
    const before = await rowOf(address.id)

    const response = await patchJson(client, addressPath(address.id), {
      area_tole: '  New Baneshwor  ',
    })
    assert.equal(response.status, 200, response.text)
    assert.sameMembers(Object.keys(response.body), ['data'])
    assert.deepEqual(response.body.data, { ...address, area_tole: 'New Baneshwor' })
    const after = await rowOf(address.id)
    assert.notEqual(after.area_tole_enc, before.area_tole_enc)
    for (const column of [
      'label',
      'recipient_name_enc',
      'recipient_phone_enc',
      'recipient_phone_last4',
      'province_code',
      'district_code',
      'local_level_code',
      'ward_no',
      'street_landmark_enc',
      'is_default',
      'archived_at',
    ]) {
      assert.deepEqual(after[column], before[column], column)
    }

    const empty = await patchJson(client, addressPath(address.id), {})
    assert.equal(empty.status, 200, empty.text)
    assert.deepEqual(empty.body.data, response.body.data)
    assert.deepEqual(await rowOf(address.id), after)
  })

  test('T-IAM-009 updateAddress clears the label and the landmark with null, and with "", which the body parser reads as null', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const address = await created(client, { label: 'Home', street_landmark: 'Near the stupa' })

    const cleared = await patchJson(client, addressPath(address.id), {
      label: null,
      street_landmark: null,
    })
    assert.equal(cleared.status, 200, cleared.text)
    assert.isNull(cleared.body.data.label)
    assert.isNull(cleared.body.data.street_landmark)
    const clearedRow = await rowOf(address.id)
    assert.isNull(clearedRow.label)
    assert.isNull(clearedRow.street_landmark_enc)

    const set = await patchJson(client, addressPath(address.id), {
      label: 'Office',
      street_landmark: 'Gate 2',
    })
    assert.equal(set.status, 200, set.text)
    assert.include(set.body.data, { label: 'Office', street_landmark: 'Gate 2' })

    const blank = await patchJson(client, addressPath(address.id), {
      label: '',
      street_landmark: '',
    })
    assert.equal(blank.status, 200, blank.text)
    assert.isNull(blank.body.data.label)
    assert.isNull(blank.body.data.street_landmark)
  })

  test('T-IAM-009 updateAddress refuses {label} with 422 required on {field} and changes nothing')
    .with([
      { label: 'a null recipient name', field: 'recipient_name', body: { recipient_name: null } },
      { label: 'a null phone', field: 'recipient_phone', body: { recipient_phone: null } },
      { label: 'a null area', field: 'area_tole', body: { area_tole: null } },
      { label: 'an empty area, read as null', field: 'area_tole', body: { area_tole: '' } },
      { label: 'a null ward', field: 'ward_no', body: { ward_no: null } },
      {
        label: 'a null local level',
        field: 'local_level_code',
        body: { local_level_code: null },
      },
      { label: 'a null is_default', field: 'is_default', body: { is_default: null } },
    ])
    .run(async ({ assert }, { field, body }) => {
      const { client } = await signedIn()
      const address = await created(client)
      const before = await rowOf(address.id)
      const response = await patchJson(client, addressPath(address.id), {
        label: 'Not Saved',
        ...body,
      })
      assert.equal(response.status, 422, response.text)
      assert.deepEqual(problemFields(response.body), [[field, 'required']])
      assert.deepEqual(await rowOf(address.id), before)
    })

  test('T-IAM-009 updateAddress checks a ward sent alone against the saved local level [AC-FR-IAM-012-2]', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const address = await created(client, { ward_no: 5 })
    const before = await rowOf(address.id)
    const wardCount = await wardCountOf('30608')

    const beyond = await patchJson(client, addressPath(address.id), { ward_no: wardCount + 1 })
    assert.equal(beyond.status, 422, beyond.text)
    assert.deepEqual(problemFields(beyond.body), [['ward_no', 'ward_out_of_range']])
    assert.deepEqual(await rowOf(address.id), before)

    const last = await patchJson(client, addressPath(address.id), { ward_no: wardCount })
    assert.equal(last.status, 200, last.text)
    assert.equal(last.body.data.ward_no, wardCount)
    assert.equal(last.body.data.local_level_code, '30608')
    assert.equal(last.body.data.postal_code, `30608${String(wardCount).padStart(2, '0')}`)
  })

  test('T-IAM-009 updateAddress keeps a saved place whose local level was retired, until a place member is sent', async ({
    assert,
  }) => {
    // Test rows, rolled back with the test; 30698 is not a seeded code.
    await db.table('local_levels').insert({
      code: '30698',
      district_code: '306',
      name_en: 'Test Kept Municipality',
      name_ne: 'परीक्षण नगरपालिका',
      type: 'municipality',
      ward_count: 9,
      is_active: true,
    })
    const { client } = await signedIn()
    const address = await created(client, { local_level_code: '30698', ward_no: 3 })
    await db.from('local_levels').where('code', '30698').update({ is_active: false })

    const renamed = await patchJson(client, addressPath(address.id), { label: 'Old flat' })
    assert.equal(renamed.status, 200, renamed.text)
    assert.include(renamed.body.data, {
      label: 'Old flat',
      local_level_code: '30698',
      local_level_name: 'Test Kept Municipality',
      ward_no: 3,
    })
    const list = await getJson(client, ADDRESSES)
    assert.deepEqual(
      (list.body.data as Address[]).map((item) => item.id),
      [address.id]
    )

    const ward = await patchJson(client, addressPath(address.id), { ward_no: 4 })
    assert.equal(ward.status, 422, ward.text)
    assert.deepEqual(problemFields(ward.body), [['local_level_code', 'location_mismatch']])
  })
})

test.group('T-IAM-009 deleteAddress', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-009 deleteAddress answers 204 and archives the address: the row stays, out of the list; a repeat is 404 [AC-FR-IAM-012-4]', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    const first = await created(client)
    const second = await created(client, { label: 'Office' })

    const response = await deleteJson(client, addressPath(second.id))
    assert.equal(response.status, 204, response.text)
    assert.equal(response.text, '')
    const row = await rowOf(second.id)
    assert.instanceOf(row.archived_at, Date)
    assert.isFalse(row.is_default)

    const list = await getJson(client, ADDRESSES)
    assert.deepEqual(
      (list.body.data as Address[]).map((item) => item.id),
      [first.id]
    )

    const again = await deleteJson(client, addressPath(second.id))
    assert.equal(again.status, 404, again.text)
    assert.equal(again.body.code, 'NOT_FOUND')
  })

  test('T-IAM-009 deleteAddress of the only address leaves none; the next address is the default again', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const only = await created(client)
    const response = await deleteJson(client, addressPath(only.id))
    assert.equal(response.status, 204, response.text)
    assert.lengthOf(await activeOf(user.id), 0)
    assert.lengthOf(await defaultIds(user.id), 0)
    const list = await getJson(client, ADDRESSES)
    assert.deepEqual(list.body, { data: [] })

    const next = await created(client, { is_default: false })
    assert.isTrue(next.is_default)
  })
})

test.group('T-SEC-006 addresses of others and archived addresses', (group) => {
  group.each.teardown(forgetMade)

  test("T-SEC-006 another user's address: PATCH and DELETE answer 404 with the body of a missing ID, and nothing changes", async ({
    assert,
  }) => {
    const owner = await signedIn()
    const intruder = await signedIn()
    const address = await created(owner.client)
    const before = await rowOf(address.id)
    const missing = randomUUID()

    const missingPatch = await patchJson(intruder.client, addressPath(missing), {
      label: 'Mine now',
    })
    const foreignPatch = await patchJson(intruder.client, addressPath(address.id), {
      label: 'Mine now',
    })
    assert.equal(missingPatch.status, 404, missingPatch.text)
    assert.equal(foreignPatch.status, 404, foreignPatch.text)
    assert.equal(foreignPatch.body.code, 'NOT_FOUND')
    assert.property(foreignPatch.body, 'request_id')
    assert.deepEqual(withoutRequestId(foreignPatch.body), withoutRequestId(missingPatch.body))

    const foreignDefault = await patchJson(intruder.client, addressPath(address.id), {
      is_default: true,
    })
    assert.equal(foreignDefault.status, 404, foreignDefault.text)

    const missingDelete = await deleteJson(intruder.client, addressPath(missing))
    const foreignDelete = await deleteJson(intruder.client, addressPath(address.id))
    assert.equal(missingDelete.status, 404, missingDelete.text)
    assert.equal(foreignDelete.status, 404, foreignDelete.text)
    assert.deepEqual(withoutRequestId(foreignDelete.body), withoutRequestId(missingDelete.body))

    assert.deepEqual(await rowOf(address.id), before)
    assert.lengthOf(await rowsOf(intruder.user.id), 0)
  })

  test('T-SEC-006 an archived address: PATCH and DELETE answer 404 with the body of a missing ID, and nothing changes', async ({
    assert,
  }) => {
    const { client } = await signedIn()
    await created(client)
    const archived = await created(client, { label: 'Old flat' })
    const removed = await deleteJson(client, addressPath(archived.id))
    assert.equal(removed.status, 204, removed.text)
    const before = await rowOf(archived.id)
    const missing = randomUUID()

    const missingPatch = await patchJson(client, addressPath(missing), { is_default: true })
    const archivedPatch = await patchJson(client, addressPath(archived.id), { is_default: true })
    assert.equal(archivedPatch.status, 404, archivedPatch.text)
    assert.deepEqual(withoutRequestId(archivedPatch.body), withoutRequestId(missingPatch.body))

    const missingDelete = await deleteJson(client, addressPath(missing))
    const archivedDelete = await deleteJson(client, addressPath(archived.id))
    assert.equal(archivedDelete.status, 404, archivedDelete.text)
    assert.deepEqual(withoutRequestId(archivedDelete.body), withoutRequestId(missingDelete.body))

    assert.deepEqual(await rowOf(archived.id), before)
  })

  test('T-SEC-006 an address ID that is not a UUID answers 404', async ({ assert }) => {
    const { client } = await signedIn()
    await created(client)
    const patched = await patchJson(client, addressPath('not-a-uuid'), { label: 'Office' })
    assert.equal(patched.status, 404, patched.text)
    assert.equal(patched.body.code, 'NOT_FOUND')
    const deleted = await deleteJson(client, addressPath('123'))
    assert.equal(deleted.status, 404, deleted.text)
    assert.equal(deleted.body.code, 'NOT_FOUND')
  })
})

test.group('T-IAM-009 who may use the address book', (group) => {
  group.each.teardown(forgetMade)

  test('T-IAM-009 a pending_verification user may use the address book [AC-FR-IAM-002-2]', async ({
    assert,
  }) => {
    const { user, client } = await signedIn('pending_verification')
    const address = await created(client)
    assert.isTrue(address.is_default)
    const list = await getJson(client, ADDRESSES)
    assert.equal(list.status, 200, list.text)
    assert.lengthOf(list.body.data, 1)
    const updated = await patchJson(client, addressPath(address.id), { label: 'Office' })
    assert.equal(updated.status, 200, updated.text)
    const removed = await deleteJson(client, addressPath(address.id))
    assert.equal(removed.status, 204, removed.text)
    assert.lengthOf(await rowsOf(user.id), 1)
  })

  test('T-IAM-009 a guest gets 401 on the list and the writes', async ({ assert }) => {
    const client = await guest()
    const list = await getJson(client, ADDRESSES)
    assert.equal(list.status, 401, list.text)
    assert.equal(list.body.code, 'UNAUTHENTICATED')
    const write = await postJson(client, ADDRESSES, addressBody())
    assert.equal(write.status, 401, write.text)
    assert.equal(write.body.code, 'UNAUTHENTICATED')
    const removed = await deleteJson(client, addressPath(randomUUID()))
    assert.equal(removed.status, 401, removed.text)
  })

  test('T-SEC-013 createAddress without X-XSRF-TOKEN gets 403 FORBIDDEN and writes nothing', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const response = await postJson(client, ADDRESSES, addressBody(), { 'X-XSRF-TOKEN': '' })
    assert.equal(response.status, 403, response.text)
    assert.equal(response.body.code, 'FORBIDDEN')
    assert.lengthOf(await rowsOf(user.id), 0)
  })

  test('T-IAM-009 a stamp rotated or a suspension after the account check answers 401 or 403 and writes nothing', async ({
    assert,
  }) => {
    const { user, client } = await signedIn()
    const address = await created(client)
    const before = await rowOf(address.id)

    await db
      .from('users')
      .where('id', user.id)
      .update({ security_stamp: db.raw('gen_random_uuid()') })
    const staleCreate = await refusal(() => createAddress(user.id, command(user)))
    assert.instanceOf(staleCreate, DomainError)
    assert.equal((staleCreate as DomainError).problemCode, 'UNAUTHENTICATED')
    const staleUpdate = await refusal(() =>
      updateAddress(user.id, address.id, { label: 'Changed', sessionStamp: user.securityStamp })
    )
    assert.instanceOf(staleUpdate, DomainError)
    assert.equal((staleUpdate as DomainError).problemCode, 'UNAUTHENTICATED')

    const fresh = await db.from('users').where('id', user.id).firstOrFail()
    await db.from('users').where('id', user.id).update({ status: 'suspended' })
    const suspended = await refusal(() =>
      deleteAddress(user.id, address.id, { sessionStamp: String(fresh.security_stamp) })
    )
    assert.instanceOf(suspended, DomainError)
    assert.equal((suspended as DomainError).problemCode, 'ACCOUNT_SUSPENDED')

    assert.lengthOf(await rowsOf(user.id), 1)
    assert.deepEqual(await rowOf(address.id), before)
  })
})
