import { test } from '@japa/runner'
import {
  reportToTracker,
  setTrackerTransport,
  type TrackerContext,
  type TrackerEvent,
} from '#exceptions/tracker'

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
      release: process.env.APP_RELEASE ?? null,
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

  test('a failing transport is reported back, never thrown', async ({ assert }) => {
    setTrackerTransport({
      capture: () => {
        throw new Error('tracker down')
      },
    })
    assert.equal(await reportToTracker(new Error('x'), context(500)), 'failed')
  })

  test('without a transport nothing is sent and nothing throws', async ({ assert }) => {
    setTrackerTransport(null)
    assert.equal(await reportToTracker(new Error('x'), context(500)), 'skipped')
  })
})
