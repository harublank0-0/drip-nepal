import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { UserFactory } from '#database/factories/user_factory'
import { clientNetwork } from '#modules/platform/rate_limits'
import { testBrowser } from '#tests/support/browser'
import { signIn } from '#tests/support/courier_http'
import { forgetKeys, getJson, randomIPv4, type Guest } from '#tests/support/identity'

/*
 * The address cascades (docs/06 §13.2 `listProvinces`, `listDistricts`,
 * `listLocalLevels`; 01 AC-FR-IAM-012-1; M1 part 6b), read from the seeded
 * location reference data (docs/04a §9.1–§9.3, VX-10), T-IAM-009:
 * - the seven provinces by code, the districts of one province by name, the
 *   local levels of one district by name with their ward counts, each item
 *   exactly `{code, name}` or `{code, name, ward_count}`, in `{ data }`;
 * - open to a guest and to a signed-in user;
 * - 400 `INVALID_QUERY_PARAMETER` for a missing, malformed or repeated
 *   code and for any parameter outside the operation's closed list
 *   (06 §6.3); a well-formed code that names no unit answers `{ data: [] }`;
 * - only active units are offered: the inactive cases use test rows with
 *   codes the seed does not have (397, 398, 30698, 30699, 39801), inserted
 *   in the test's transaction, never changes to seeded rows.
 * Each call charges `catalog_ip` on the client network (06 §9.1), which the
 * limiter store commits on its own connection, so each test sends its own
 * network as `X-Forwarded-For` and deletes its keys (docs/10 §3.3). The
 * limit itself is in tests/concurrency/identity/address_book.spec.ts
 * (T-SEC-036).
 */

const PROVINCES = '/api/v1/locations/provinces'
const DISTRICTS = '/api/v1/locations/districts'
const LOCAL_LEVELS = '/api/v1/locations/local-levels'

const SEVEN_PROVINCES = [
  { code: '1', name: 'Koshi' },
  { code: '2', name: 'Madhesh' },
  { code: '3', name: 'Bagmati' },
  { code: '4', name: 'Gandaki' },
  { code: '5', name: 'Lumbini' },
  { code: '6', name: 'Karnali' },
  { code: '7', name: 'Sudurpashchim' },
]

// Bagmati's 13 districts by name (database/seeders/reference/data/locations.csv).
const BAGMATI_DISTRICTS = [
  { code: '307', name: 'Bhaktapur' },
  { code: '313', name: 'Chitawan' },
  { code: '304', name: 'Dhading' },
  { code: '301', name: 'Dolakha' },
  { code: '306', name: 'Kathmandu' },
  { code: '309', name: 'Kavrepalanchok' },
  { code: '308', name: 'Lalitpur' },
  { code: '312', name: 'Makwanpur' },
  { code: '305', name: 'Nuwakot' },
  { code: '310', name: 'Ramechhap' },
  { code: '303', name: 'Rasuwa' },
  { code: '311', name: 'Sindhuli' },
  { code: '302', name: 'Sindhupalchok' },
]

// Kathmandu district's 11 local levels by name, with their ward counts (the same file).
const KATHMANDU_LOCAL_LEVELS = [
  { code: '30604', name: 'Budhanilkhantha Municipality', ward_count: 13 },
  { code: '30610', name: 'Chandragiri Municipality', ward_count: 15 },
  { code: '30611', name: 'Dakshinkali Municipality', ward_count: 9 },
  { code: '30603', name: 'Gokarneshwor Municipality', ward_count: 9 },
  { code: '30602', name: 'Kageshwori Manahara Municipality', ward_count: 9 },
  { code: '30608', name: 'Kathmandu Metropolitan City', ward_count: 32 },
  { code: '30609', name: 'Kirtipur Municipality', ward_count: 10 },
  { code: '30607', name: 'Nagarjun Municipality', ward_count: 10 },
  { code: '30601', name: 'Shankharapur Municipality', ward_count: 9 },
  { code: '30606', name: 'Tarakeshwor Municipality', ward_count: 11 },
  { code: '30605', name: 'Tokha Municipality', ward_count: 11 },
]

// The client networks this file used, whose `catalog_ip` keys each test deletes.
const networks: string[] = []

async function forgetNetworks() {
  for (const network of networks.splice(0)) await forgetKeys('catalog_ip', network)
}

// A guest without a session, on its own client network.
function visitor(): Guest {
  const ip = randomIPv4()
  networks.push(clientNetwork(ip))
  return { browser: testBrowser(), ip }
}

const codesOf = (body: { data: { code: string }[] }) => body.data.map((item) => item.code)

test.group('T-IAM-009 the address cascades', (group) => {
  group.each.teardown(forgetNetworks)

  test('T-IAM-009 listProvinces answers the seven provinces by code as {code, name} [AC-FR-IAM-012-1]', async ({
    assert,
  }) => {
    const response = await getJson(visitor(), PROVINCES)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: SEVEN_PROVINCES })
  })

  test('T-IAM-009 listDistricts answers the districts of one province by name as {code, name}', async ({
    assert,
  }) => {
    const response = await getJson(visitor(), `${DISTRICTS}?province=3`)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: BAGMATI_DISTRICTS })

    const gandaki = await getJson(visitor(), `${DISTRICTS}?province=4`)
    assert.equal(gandaki.status, 200, gandaki.text)
    const codes = codesOf(gandaki.body)
    assert.lengthOf(codes, 11)
    assert.include(codes, '405')
    for (const code of codes) assert.match(code, /^4\d{2}$/)
  })

  test('T-IAM-009 listLocalLevels answers the local levels of one district by name with their ward counts', async ({
    assert,
  }) => {
    const response = await getJson(visitor(), `${LOCAL_LEVELS}?district=306`)
    assert.equal(response.status, 200, response.text)
    assert.deepEqual(response.body, { data: KATHMANDU_LOCAL_LEVELS })
  })

  test('T-IAM-009 a signed-in user may call the three cascades too', async ({ assert }) => {
    const user = await UserFactory.create()
    const ip = randomIPv4()
    networks.push(clientNetwork(ip))
    const client: Guest = { browser: await signIn(user.id), ip }
    for (const path of [PROVINCES, `${DISTRICTS}?province=3`, `${LOCAL_LEVELS}?district=306`]) {
      const response = await getJson(client, path)
      assert.equal(response.status, 200, `${path}: ${response.text}`)
      assert.isNotEmpty(response.body.data, path)
    }
  })

  test('T-IAM-009 {operation} answers 400 INVALID_QUERY_PARAMETER on {field} for {label}')
    .with([
      { operation: 'listDistricts', label: 'no province', path: DISTRICTS, field: 'province' },
      {
        operation: 'listDistricts',
        label: 'province 8',
        path: `${DISTRICTS}?province=8`,
        field: 'province',
      },
      {
        operation: 'listDistricts',
        label: 'province abc',
        path: `${DISTRICTS}?province=abc`,
        field: 'province',
      },
      {
        operation: 'listDistricts',
        label: 'a district code as the province',
        path: `${DISTRICTS}?province=306`,
        field: 'province',
      },
      {
        operation: 'listDistricts',
        label: 'a repeated province',
        path: `${DISTRICTS}?province=1&province=2`,
        field: 'province',
      },
      {
        operation: 'listDistricts',
        label: 'an empty province',
        path: `${DISTRICTS}?province=`,
        field: 'province',
      },
      {
        operation: 'listDistricts',
        label: 'an unknown parameter',
        path: `${DISTRICTS}?province=3&limit=5`,
        field: 'limit',
      },
      {
        operation: 'listLocalLevels',
        label: 'no district',
        path: LOCAL_LEVELS,
        field: 'district',
      },
      {
        operation: 'listLocalLevels',
        label: 'a two-digit district',
        path: `${LOCAL_LEVELS}?district=30`,
        field: 'district',
      },
      {
        operation: 'listLocalLevels',
        label: 'district 806',
        path: `${LOCAL_LEVELS}?district=806`,
        field: 'district',
      },
      {
        operation: 'listLocalLevels',
        label: 'a repeated district',
        path: `${LOCAL_LEVELS}?district=306&district=308`,
        field: 'district',
      },
      {
        operation: 'listLocalLevels',
        label: 'the province parameter',
        path: `${LOCAL_LEVELS}?province=3`,
        field: 'province',
      },
      {
        operation: 'listProvinces',
        label: 'any parameter',
        path: `${PROVINCES}?country=np`,
        field: 'country',
      },
    ])
    .run(async ({ assert }, { path, field }) => {
      const response = await getJson(visitor(), path)
      assert.equal(response.status, 400, response.text)
      assert.equal(response.body.code, 'INVALID_QUERY_PARAMETER')
      assert.deepEqual(
        response.body.errors.map((item: { field: string }) => item.field),
        [field]
      )
    })

  test('T-IAM-009 {operation} answers an empty list for {label}, a well-formed code with no unit')
    .with([
      { operation: 'listLocalLevels', label: 'district 199', path: `${LOCAL_LEVELS}?district=199` },
      { operation: 'listLocalLevels', label: 'district 314', path: `${LOCAL_LEVELS}?district=314` },
    ])
    .run(async ({ assert }, { path }) => {
      const response = await getJson(visitor(), path)
      assert.equal(response.status, 200, response.text)
      assert.deepEqual(response.body, { data: [] })
    })

  test('T-IAM-009 the cascades offer active units only', async ({ assert }) => {
    // Test rows with codes the seed does not have, rolled back with the test.
    await db.table('districts').insert([
      {
        code: '397',
        province_code: '3',
        name_en: 'Test Active District',
        name_ne: 'परीक्षण जिल्ला',
        is_active: true,
      },
      {
        code: '398',
        province_code: '3',
        name_en: 'Test Retired District',
        name_ne: 'परीक्षण जिल्ला',
        is_active: false,
      },
    ])
    await db.table('local_levels').insert([
      {
        code: '30698',
        district_code: '306',
        name_en: 'Test Active Municipality',
        name_ne: 'परीक्षण नगरपालिका',
        type: 'municipality',
        ward_count: 9,
        is_active: true,
      },
      {
        code: '30699',
        district_code: '306',
        name_en: 'Test Retired Municipality',
        name_ne: 'परीक्षण नगरपालिका',
        type: 'municipality',
        ward_count: 9,
        is_active: false,
      },
      {
        code: '39801',
        district_code: '398',
        name_en: 'Test Orphan Municipality',
        name_ne: 'परीक्षण नगरपालिका',
        type: 'municipality',
        ward_count: 5,
        is_active: true,
      },
    ])
    const client = visitor()

    const districts = await getJson(client, `${DISTRICTS}?province=3`)
    assert.equal(districts.status, 200, districts.text)
    const districtCodes = codesOf(districts.body)
    assert.include(districtCodes, '397')
    assert.notInclude(districtCodes, '398')

    const localLevels = await getJson(client, `${LOCAL_LEVELS}?district=306`)
    assert.equal(localLevels.status, 200, localLevels.text)
    const localLevelCodes = codesOf(localLevels.body)
    assert.include(localLevelCodes, '30698')
    assert.notInclude(localLevelCodes, '30699')

    // An inactive district offers none of its local levels, active or not.
    const orphan = await getJson(client, `${LOCAL_LEVELS}?district=398`)
    assert.equal(orphan.status, 200, orphan.text)
    assert.deepEqual(orphan.body, { data: [] })
  })
})
