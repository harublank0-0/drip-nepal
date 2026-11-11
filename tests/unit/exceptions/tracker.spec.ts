import { test } from '@japa/runner'
import {
  reportToTracker,
  setTrackerTransport,
  userReference,
  type TrackerContext,
  type TrackerEvent,
} from '#exceptions/tracker'
import { runtime } from '#config/runtime'

/*
 * T-ARCH-026: `reportToTracker` with a fake transport (docs/09 §5.6). A 422
 * sends nothing; a 500 sends one event with the tags of §5.6, and the event
 * holds no request body, cookie, email or other member of the error.
 */

const context = (status: number): TrackerContext => ({
  request_id: 'req-0123456789',
  status,
  route: '/api/v1/shops/:id',
  route_name: 'getShop',
  user_ref: null,
})

function fakeTransport() {
  const events: TrackerEvent[] = []
  setTrackerTransport({ capture: (event) => void events.push(event) })
  return events
}

test.group('T-ARCH-026 reportToTracker', (group) => {
  group.each.teardown(() => setTrackerTransport(null))

  test('a 422 sends nothing', async ({ assert }) => {
    const events = fakeTransport()
    await reportToTracker(new Error('validation'), context(422))
    assert.lengthOf(events, 0)
  })

  test('a 500 sends one event with the tags and no personal data', async ({ assert }) => {
    const events = fakeTransport()
    const error = Object.assign(new Error('update "users" set "email" = $1 - value too long'), {
      code: '22001',
      severity: 'ERROR',
      detail: 'Failing row contains (ram@example.com)',
      body: '{"email":"ram@example.com","password":"hunter2"}',
      headers: { cookie: 'adonis-session=abc' },
    })
    await reportToTracker(error, context(500))

    assert.lengthOf(events, 1)
    const [event] = events
    assert.deepEqual(event.tags, {
      request_id: 'req-0123456789',
      status: 500,
      route: '/api/v1/shops/:id',
      route_name: 'getShop',
      user_ref: null,
      release: runtime.release,
      environment: 'test',
    })
    assert.deepEqual(Object.keys(event.error).sort(), ['code', 'message', 'name', 'stack'])
    assert.equal(event.error.code, '22001')
    const serialised = JSON.stringify(event)
    for (const leak of ['ram@example.com', 'hunter2', 'adonis-session', 'Failing row']) {
      assert.notInclude(serialised, leak)
    }
  })

  test("a PostgreSQL error's own message, which can quote a value, is not sent", async ({
    assert,
  }) => {
    const events = fakeTransport()
    const message =
      'select * from "users" where "id" = $1 - invalid input syntax for type uuid: "ram@example.com"'
    const error = Object.assign(new Error(message), {
      code: '22P02',
      severity: 'ERROR',
      routine: 'string_to_uuid',
    })
    error.stack = `error: ${message}\n    at parseErrorMessage (parser.ts:394:9)`
    await reportToTracker(error, context(500))

    const [event] = events
    assert.equal(event.error.message, 'SQLSTATE 22P02: select * from "users" where "id" = $1')
    assert.equal(event.error.stack, '    at parseErrorMessage (parser.ts:394:9)')
    assert.notInclude(JSON.stringify(event), 'ram@example.com')
  })

  test('a data exception whose value contains " - " sends {expected}')
    .with([
      {
        name: 'with the Knex prefix',
        message:
          'select * from "users" where "id" = $1 limit $2 - invalid input syntax for type uuid: "ram@example.com - x"',
        expected: 'SQLSTATE 22P02: select * from "users" where "id" = $1 limit $2',
      },
      {
        name: 'without one (a direct pg query)',
        message: 'invalid input syntax for type uuid: "ram@example.com - x"',
        expected: 'SQLSTATE 22P02',
      },
    ])
    .run(async ({ assert }, { message, expected }) => {
      const events = fakeTransport()
      const error = Object.assign(new Error(message), { code: '22P02', severity: 'ERROR' })
      await reportToTracker(error, context(500))
      assert.equal(events[0].error.message, expected)
      assert.notInclude(JSON.stringify(events[0]), 'ram@example.com')
    })

  test('another class keeps the server message, which names objects, not values', async ({
    assert,
  }) => {
    const events = fakeTransport()
    const message = 'delete from "audit_logs" - table audit_logs is append-only'
    const error = Object.assign(new Error(message), {
      code: 'P0001',
      severity: 'ERROR',
      detail: 'Key (email)=(ram@example.com)',
    })
    await reportToTracker(error, context(500))
    assert.equal(events[0].error.message, message)
    assert.notInclude(JSON.stringify(events[0]), 'ram@example.com')
  })

  test('a failing transport is reported back, never thrown', async ({ assert }) => {
    setTrackerTransport({
      capture: () => {
        throw new Error('tracker down')
      },
    })
    assert.deepEqual(await reportToTracker(new Error('x'), context(500)), {
      outcome: 'failed',
      cause: { name: 'Error', code: null },
    })
  })

  test('without a transport nothing is sent and nothing throws', async ({ assert }) => {
    setTrackerTransport(null)
    assert.deepEqual(await reportToTracker(new Error('x'), context(500)), { outcome: 'skipped' })
  })

  test('user_ref is a keyed hash of the user ID, never the ID', ({ assert }) => {
    const key = Buffer.alloc(32, 5)
    const reference = userReference('01929a00-0000-7000-8000-000000000001', key)
    assert.match(reference!, /^[0-9a-f]{64}$/)
    assert.notInclude(reference!, '01929a00')
    assert.equal(reference, userReference('01929a00-0000-7000-8000-000000000001', key))
    assert.notEqual(
      reference,
      userReference('01929a00-0000-7000-8000-000000000001', Buffer.alloc(32, 6))
    )
    assert.isNull(userReference(undefined, key))
    assert.isNull(userReference('01929a00-0000-7000-8000-000000000001', undefined))
  })
})
