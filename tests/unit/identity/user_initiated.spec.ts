import { test } from '@japa/runner'
import type { HttpContext } from '@adonisjs/core/http'
import { isUserInitiated } from '#controllers/support/session'

/*
 * T-SEC-009, the poll part of docs/07 §3.4: only a user-initiated request
 * refreshes an idle clock. A page visit is one, full or Inertia; an unsafe
 * API method is one; an API read is not; a poll never is, by `X-Poll: 1` or
 * by an Inertia partial reload that asks only for poll props.
 */

type Request = { method: string; url: string; headers?: Record<string, string | undefined> }

const ctxOf = ({ method, url, headers = {} }: Request) =>
  ({
    request: {
      method: () => method,
      url: () => url,
      header: (name: string) => headers[name.toLowerCase()],
    },
  }) as unknown as HttpContext

test.group('T-SEC-009 which requests refresh an idle clock', () => {
  test('T-SEC-009 {label} refreshes')
    .with([
      { label: 'a full page visit', request: { method: 'GET', url: '/seller/shop-a' } },
      {
        label: 'an Inertia visit',
        request: { method: 'GET', url: '/seller/shop-a', headers: { 'x-inertia': 'true' } },
      },
      {
        label: 'a partial reload that asks for more than poll props',
        request: {
          method: 'GET',
          url: '/seller/shop-a',
          headers: { 'x-inertia': 'true', 'x-inertia-partial-data': 'newOrderCount,orders' },
        },
      },
      { label: 'an API write', request: { method: 'POST', url: '/api/v1/seller/shops/shop-a' } },
      { label: 'an API delete', request: { method: 'DELETE', url: '/api/v1/seller/shops/a/x' } },
    ])
    .run(({ assert }, row: { label: string; request: Request }) => {
      assert.isTrue(isUserInitiated(ctxOf(row.request)))
    })

  test('T-SEC-009 {label} does not refresh')
    .with([
      { label: 'an API read', request: { method: 'GET', url: '/api/v1/seller/shops/shop-a' } },
      {
        label: 'an API write marked as a poll',
        request: { method: 'POST', url: '/api/v1/seller/shops/a', headers: { 'x-poll': '1' } },
      },
      {
        label: 'a page visit marked as a poll',
        request: { method: 'GET', url: '/seller/shop-a', headers: { 'x-poll': '1' } },
      },
      {
        label: 'a partial reload that asks only for poll props',
        request: {
          method: 'GET',
          url: '/seller/shop-a',
          headers: { 'x-inertia': 'true', 'x-inertia-partial-data': ' newOrderCount ' },
        },
      },
      { label: 'a page HEAD', request: { method: 'HEAD', url: '/seller/shop-a' } },
    ])
    .run(({ assert }, row: { label: string; request: Request }) => {
      assert.isFalse(isUserInitiated(ctxOf(row.request)))
    })
})
