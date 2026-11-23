import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import encryption from '@adonisjs/core/services/encryption'
import { CookieClient } from '@adonisjs/core/http'
import { UserFactory } from '#database/factories/user_factory'
import { DomainError } from '#exceptions/domain_error'
import { createAddress, type CreateAddressCommand } from '#modules/identity/actions/create_address'
import { deleteAddress } from '#modules/identity/actions/delete_address'
import { updateAddress } from '#modules/identity/actions/update_address'
import { clientNetwork, rateLimitKey, rateLimiter } from '#modules/platform/rate_limits'
import { MIGRATOR_CONNECTION } from '#tests/support/database'
import { testBrowser, type Browser } from '#tests/support/browser'
import { send, signIn } from '#tests/support/courier_http'
import { forgetKeys, randomIPv4 } from '#tests/support/identity'

/*
 * The address book where real commits matter (docs/10 §3.3; docs/04a
 * §5.5; M1 part 6b). The actions are called directly with the user's
 * current `security_stamp` as the session stamp; every call commits on its
 * own pool connection, so the user-row lock (`FOR NO KEY UPDATE`, level 0
 * of docs/05 §4.4) is what keeps one user's writes apart.
 * - T-IAM-107: two concurrent "make default" updates both succeed and leave
 *   exactly one default, one of the two; two concurrent first addresses
 *   leave exactly one default; eleven concurrent creations by a user without
 *   addresses leave exactly 10 active addresses and one 422 `address_limit`;
 *   archiving the default while another address is made the default leaves
 *   exactly one default, the other address. Three rounds each, fresh users
 *   each round. Any other error (a 23505 from `user_addresses_one_default_key`,
 *   a deadlock, a lock timeout) fails the test.
 * - T-SEC-036: `catalog_ip` refuses the 121st location call a minute from
 *   one client network with 429 `RATE_LIMITED`, for a guest and for a
 *   signed-in user alike, and a signed-in user's call is charged to the
 *   network, not to `api_user`. The used-up window is set with the limiter's
 *   `set`, not by sending 120 requests; the client network is sent as
 *   `X-Forwarded-For`, which the test server takes from loopback, a trusted
 *   proxy (config/app.ts).
 * Each test uses fresh emails under its own prefix, then deletes its users,
 * their addresses and sessions, the guest sessions its requests made (as
 * the migrator), and its limiter keys.
 */

const PREFIX = 'conc-address-'
const ROUNDS = 3
const PROVINCES = '/api/v1/locations/provinces'
const cookies = new CookieClient(encryption.use())

async function account(label: string) {
  const user = await UserFactory.merge({
    email: `${PREFIX}${label}-${randomUUID()}@example.com`,
  }).create()
  await user.refresh()
  return user
}

// A `createAddress` command in Kathmandu Metropolitan City (province 3, district 306).
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

const activeOf = (userId: string) =>
  db.from('user_addresses').where('user_id', userId).whereNull('archived_at')

async function defaultIds(userId: string) {
  const rows = await activeOf(userId).where('is_default', true).select('id')
  return rows.map((row) => row.id as string)
}

// The rejection reasons of settled calls, for a failure message.
const reasons = (results: PromiseSettledResult<unknown>[]) =>
  results
    .flatMap((result) => (result.status === 'rejected' ? [String(result.reason)] : []))
    .join('; ')

function sessionIdOf(browser: Browser) {
  const value = browser.cookie('dripnepal_session')
  return value ? (cookies.unsign('dripnepal_session', decodeURIComponent(value)) as string) : null
}

async function cleanUp(sessionIds: string[] = []) {
  const trx = await db.connection(MIGRATOR_CONNECTION).transaction()
  try {
    const users = await trx.from('users').where('email', 'like', `${PREFIX}%`).select('id')
    const ids = users.map((user) => user.id as string)
    if (ids.length > 0) {
      await trx.from('user_addresses').whereIn('user_id', ids).delete()
      await trx.from('sessions').whereIn('user_id', ids).delete()
      await trx.from('users').whereIn('id', ids).delete()
    }
    if (sessionIds.length > 0) await trx.from('sessions').whereIn('id', sessionIds).delete()
    await trx.commit()
  } catch (error) {
    await trx.rollback()
    throw error
  }
}

test.group('T-IAM-107 one default and at most 10 addresses under concurrency', (group) => {
  group.each.setup(() => () => cleanUp())

  test('T-IAM-107 two concurrent "make default" updates both succeed and leave exactly one default', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await account(`make-default-${round}`)
      const first = await createAddress(user.id, command(user, { label: 'First' }))
      const second = await createAddress(user.id, command(user, { label: 'Second' }))
      const third = await createAddress(user.id, command(user, { label: 'Third' }))
      assert.deepEqual(await defaultIds(user.id), [first])

      const stamp = user.securityStamp
      const results = await Promise.allSettled([
        updateAddress(user.id, second, { isDefault: true, sessionStamp: stamp }),
        updateAddress(user.id, third, { isDefault: true, sessionStamp: stamp }),
      ])
      assert.deepEqual(
        results.map((result) => result.status),
        ['fulfilled', 'fulfilled'],
        `round ${round}: ${reasons(results)}`
      )
      const defaults = await defaultIds(user.id)
      assert.lengthOf(defaults, 1, `round ${round}`)
      assert.oneOf(defaults[0], [second, third], `round ${round}`)
      assert.lengthOf(await activeOf(user.id), 3)
    }
  }).timeout(60_000)

  test('T-IAM-107 two concurrent first addresses leave exactly one default', async ({ assert }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await account(`first-${round}`)
      // Rounds alternate between neither and both asking to be the default.
      const isDefault = round % 2 === 1
      const results = await Promise.allSettled([
        createAddress(user.id, command(user, { label: 'One', isDefault })),
        createAddress(user.id, command(user, { label: 'Two', isDefault })),
      ])
      assert.deepEqual(
        results.map((result) => result.status),
        ['fulfilled', 'fulfilled'],
        `round ${round}: ${reasons(results)}`
      )
      assert.lengthOf(await activeOf(user.id), 2, `round ${round}`)
      assert.lengthOf(await defaultIds(user.id), 1, `round ${round}`)
    }
  }).timeout(60_000)

  test('T-IAM-107 eleven concurrent creations leave exactly 10 active addresses, and the eleventh gets 422 address_limit', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await account(`cap-${round}`)
      const results = await Promise.allSettled(
        Array.from({ length: 11 }, (_, n) =>
          createAddress(user.id, command(user, { label: `Address ${n + 1}` }))
        )
      )
      const created = results.filter((result) => result.status === 'fulfilled')
      const refused = results.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : []
      )
      assert.lengthOf(created, 10, `round ${round}: ${reasons(results)}`)
      assert.lengthOf(refused, 1, `round ${round}`)
      assert.instanceOf(refused[0], DomainError, `round ${round}: ${String(refused[0])}`)
      const error = refused[0] as DomainError
      assert.equal(error.problemCode, 'VALIDATION_FAILED')
      assert.deepEqual(
        (error.options.errors ?? []).map((item) => [item.field, item.code]),
        [[null, 'address_limit']]
      )
      assert.lengthOf(await activeOf(user.id), 10, `round ${round}`)
      assert.lengthOf(await defaultIds(user.id), 1, `round ${round}`)
    }
  }).timeout(60_000)

  test('T-IAM-107 archiving the default while another address is made the default leaves exactly one default', async ({
    assert,
  }) => {
    for (let round = 0; round < ROUNDS; round++) {
      const user = await account(`archive-${round}`)
      const first = await createAddress(user.id, command(user, { label: 'First' }))
      const second = await createAddress(user.id, command(user, { label: 'Second' }))
      await createAddress(user.id, command(user, { label: 'Third' }))

      const stamp = user.securityStamp
      const results = await Promise.allSettled([
        deleteAddress(user.id, first, { sessionStamp: stamp }),
        updateAddress(user.id, second, { isDefault: true, sessionStamp: stamp }),
      ])
      assert.deepEqual(
        results.map((result) => result.status),
        ['fulfilled', 'fulfilled'],
        `round ${round}: ${reasons(results)}`
      )
      // In either order the address made the default ends as the only default:
      // archiving first promotes the newest one, which "make default" then replaces.
      assert.deepEqual(await defaultIds(user.id), [second], `round ${round}`)
      const archived = await db.from('user_addresses').where('id', first).firstOrFail()
      assert.instanceOf(archived.archived_at, Date)
      assert.isFalse(archived.is_default)
      assert.lengthOf(await activeOf(user.id), 2, `round ${round}`)
    }
  }).timeout(60_000)

  test('T-IAM-107 archiving the default promotes the most recently created remaining address', async ({
    assert,
  }) => {
    const user = await account('promote')
    const first = await createAddress(user.id, command(user, { label: 'First' }))
    await createAddress(user.id, command(user, { label: 'Second' }))
    const third = await createAddress(user.id, command(user, { label: 'Third' }))
    await deleteAddress(user.id, first, { sessionStamp: user.securityStamp })
    assert.deepEqual(await defaultIds(user.id), [third])
  }).timeout(30_000)
})

test.group('T-SEC-036 catalog_ip on the location cascades', (group) => {
  let sessionIds: Set<string>
  let networks: string[]
  let userIds: string[]
  group.each.setup(() => {
    sessionIds = new Set()
    networks = []
    userIds = []
    return async () => {
      for (const network of networks) await forgetKeys('catalog_ip', network)
      for (const id of userIds) await forgetKeys('api_user', id)
      await cleanUp([...sessionIds])
    }
  })

  // A GET from `browser` on the client network `ip`; remembers the session it made.
  async function call(browser: Browser, ip: string, path = PROVINCES) {
    const response = await send(browser, 'GET', path, undefined, { 'X-Forwarded-For': ip })
    const id = sessionIdOf(browser)
    if (id) sessionIds.add(id)
    return response
  }

  test('T-SEC-036 a guest gets 429 RATE_LIMITED past 120 location calls a minute from one client network', async ({
    assert,
  }) => {
    const ip = randomIPv4()
    const network = clientNetwork(ip)
    networks.push(network)
    const key = rateLimitKey('catalog_ip', network)
    const browser = testBrowser()

    const first = await call(browser, ip)
    assert.equal(first.status, 200, first.text)
    const charged = await rateLimiter('catalog_ip').get(key)
    assert.equal(charged?.consumed, 1)

    // The window used up but for one call: the 120th passes, the 121st does not.
    await rateLimiter('catalog_ip').set(key, 119, '1 minute')
    const last = await call(browser, ip)
    assert.equal(last.status, 200, last.text)
    const limited = await call(browser, ip)
    assert.equal(limited.status, 429, limited.text)
    assert.equal(limited.body.code, 'RATE_LIMITED')
    const retryAfter = Number(limited.headers.get('retry-after'))
    assert.isAbove(retryAfter, 0)
    assert.isAtMost(retryAfter, 60)

    // The three cascades share the key.
    const districts = await call(browser, ip, '/api/v1/locations/districts?province=3')
    assert.equal(districts.status, 429, districts.text)
    const localLevels = await call(browser, ip, '/api/v1/locations/local-levels?district=306')
    assert.equal(localLevels.status, 429, localLevels.text)

    // Another client network is not refused.
    const elsewhere = randomIPv4()
    networks.push(clientNetwork(elsewhere))
    const other = await call(testBrowser(), elsewhere)
    assert.equal(other.status, 200, other.text)
  }).timeout(30_000)

  test('T-SEC-036 a signed-in user is charged catalog_ip on the client network, not api_user, and gets 429 alike', async ({
    assert,
  }) => {
    const user = await account('catalog')
    userIds.push(user.id)
    const browser = await signIn(user.id)
    const ip = randomIPv4()
    const network = clientNetwork(ip)
    networks.push(network)
    const key = rateLimitKey('catalog_ip', network)

    const first = await call(browser, ip)
    assert.equal(first.status, 200, first.text)
    const charged = await rateLimiter('catalog_ip').get(key)
    assert.equal(charged?.consumed, 1)
    assert.isNull(await rateLimiter('api_user').get(rateLimitKey('api_user', user.id)))

    await rateLimiter('catalog_ip').set(key, 120, '1 minute')
    const limited = await call(browser, ip)
    assert.equal(limited.status, 429, limited.text)
    assert.equal(limited.body.code, 'RATE_LIMITED')

    // The user's own operations are on api_user, which this window does not touch.
    const addresses = await call(browser, ip, '/api/v1/me/addresses')
    assert.equal(addresses.status, 200, addresses.text)
  }).timeout(30_000)
})
