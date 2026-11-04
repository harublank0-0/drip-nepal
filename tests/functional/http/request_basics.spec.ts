import { randomUUID } from 'node:crypto'
import { test } from '@japa/runner'
import router from '@adonisjs/core/services/router'
import env from '#start/env'

/*
 * Behaviour of plain HTTP requests against the running server (the
 * functional suite starts it, tests/bootstrap.ts).
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`

// The Max-Age of each cookie a response sets, by name.
function cookieAges(response: Response) {
  const ages = new Map<string, number>()
  for (const cookie of response.headers.getSetCookie()) {
    const name = cookie.slice(0, cookie.indexOf('='))
    const maxAge = /;\s*max-age=(\d+)/i.exec(cookie)?.[1]
    if (maxAge) ages.set(name, Number(maxAge))
  }
  return ages
}

test.group('HTTP basics [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('the XSRF-TOKEN cookie lasts as long as the session', async ({ assert }) => {
    const response = await fetch(`${base()}/`, { redirect: 'manual' })
    const ages = cookieAges(response)

    const xsrf = ages.get('XSRF-TOKEN')
    const session = [...ages.entries()].find(([name]) => name !== 'XSRF-TOKEN')?.[1]
    assert.isDefined(xsrf, 'the page sets an XSRF-TOKEN cookie')
    assert.isDefined(session, 'the page sets a session cookie')
    assert.isAtLeast(xsrf!, session!, 'a form open as long as the session stays submittable')
  })

  test('a malformed id in the address answers 404, not 500', async ({ assert }) => {
    for (const id of ['abc', 'zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz', randomUUID()]) {
      const response = await fetch(`${base()}/checkout/success/${id}`, { redirect: 'manual' })
      assert.equal(response.status, 404, `/checkout/success/${id}`)
    }
  })

  test('every id parameter matches only a UUID', ({ assert }) => {
    const id = randomUUID()
    const routes: [string, string][] = [
      ['DELETE', '/api/v1/cart/items/{id}'],
      ['POST', '/api/v1/cart/items/{id}'],
      ['GET', '/shops/some-shop/products/{id}/edit'],
      ['POST', '/api/v1/shops/some-shop/products/{id}'],
      ['DELETE', '/api/v1/shops/some-shop/products/{id}'],
      ['POST', '/api/v1/admin/shops/{id}/status'],
      ['GET', '/checkout/success/{id}'],
    ]
    for (const [method, pattern] of routes) {
      assert.isNotNull(
        router.match(pattern.replace('{id}', id), method, true),
        `${method} ${pattern}`
      )
      assert.isNull(
        router.match(pattern.replace('{id}', 'abc'), method, true),
        `${method} ${pattern}`
      )
    }
  })
})
