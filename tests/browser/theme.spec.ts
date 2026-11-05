import { test } from '@japa/runner'
import type { TestContext } from '@japa/runner/core'

type Page = Awaited<ReturnType<TestContext['browserContext']['newPage']>>
type Theme = 'light' | 'dark' | 'system'

const baseURL = `http://${process.env.HOST}:${process.env.PORT}`
const pagePath = '/track-order'

function watchHydration(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /hydrat|server rendered|did not match|content security policy|refused to execute inline/i.test(
        message.text()
      )
    ) {
      errors.push(message.text())
    }
  })
  return errors
}

async function waitForTheme(page: Page, theme: 'light' | 'dark') {
  const other = theme === 'light' ? 'dark' : 'light'
  await page.locator(`html.${theme}:not(.${other})`).waitFor()
}

/* T-UI-001 covers server/first-paint theme policy; T-ARCH-002 covers hydration. */
test.group('Theme preference [T-UI-001, T-ARCH-002]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('T-UI-001 server HTML without JavaScript: {description}')
    .with([
      { description: 'no preference defaults to light', cookie: null, expected: 'light' },
      { description: 'saved light', cookie: 'light', expected: 'light' },
      { description: 'saved dark', cookie: 'dark', expected: 'dark' },
      { description: 'system has a light server fallback', cookie: 'system', expected: 'light' },
      { description: 'unknown value falls back to light', cookie: 'unknown', expected: 'light' },
      { description: 'valid prefix is still invalid', cookie: 'darkgarbage', expected: 'light' },
    ] as const)
    .run(async ({ browser, assert, cleanup }, { cookie, expected }) => {
      const context = await browser.newContext({
        baseURL,
        javaScriptEnabled: false,
        colorScheme: 'dark',
      })
      cleanup(() => context.close())
      if (cookie) await context.addCookies([{ name: 'dn_theme', value: cookie, url: baseURL }])

      const page = await context.newPage()
      const response = await page.goto(pagePath)
      assert.equal(response?.status(), 200)
      assert.equal(await page.locator('html').getAttribute('class'), expected)
      await page.assertVisible(page.getByRole('heading', { name: 'Track your order' }))
      const pageData = await page.locator('#app').getAttribute('data-page')
      assert.equal(JSON.parse(pageData!).props.theme, cookie === 'system' ? 'system' : expected)
    })

  test('T-ARCH-002 saved {theme} survives hydration with the opposite OS theme')
    .with([{ theme: 'light' }, { theme: 'dark' }] as const)
    .run(async ({ browserContext, assert }, { theme }) => {
      await browserContext.addCookies([{ name: 'dn_theme', value: theme, url: baseURL }])
      const page = await browserContext.newPage()
      const errors = watchHydration(page)
      await page.emulateMedia({ colorScheme: theme === 'light' ? 'dark' : 'light' })
      const response = await page.goto(pagePath, { waitUntil: 'networkidle' })
      assert.equal(response?.status(), 200)
      const html = await response!.text()
      assert.match(html, new RegExp(`<html\\b[^>]*\\bclass="${theme}"`))
      await waitForTheme(page, theme)

      // Opening the menu proves React attached handlers to the server markup.
      await page
        .getByRole('button', { name: `Theme: ${theme === 'light' ? 'Light' : 'Dark'}` })
        .click()
      await page.assertChecked(
        page.getByRole('menuitemradio', { name: theme === 'light' ? 'Light' : 'Dark', exact: true })
      )
      assert.deepEqual(errors, [])
    })

  test('T-UI-001 a selected theme is stored for the next server request', async ({
    browserContext,
    assert,
  }) => {
    const page = await browserContext.newPage()
    const errors = watchHydration(page)
    await page.goto(pagePath, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await waitForTheme(page, 'dark')
    const cookies = await browserContext.cookies(baseURL)
    const preference = cookies.find((cookie) => cookie.name === 'dn_theme')
    assert.exists(preference)
    assert.equal(preference!.value, 'dark')
    assert.equal(preference!.path, '/')
    assert.equal(preference!.sameSite, 'Lax')
    assert.isFalse(preference!.httpOnly)
    assert.closeTo(preference!.expires - Date.now() / 1000, 31536000, 60)

    const response = await page.reload({ waitUntil: 'networkidle' })
    assert.equal(response?.status(), 200)
    const html = await response!.text()
    assert.match(html, /<html\b[^>]*\bclass="dark"/)
    await page.getByRole('button', { name: 'Theme: Dark', exact: true }).click()
    await page.assertChecked(page.getByRole('menuitemradio', { name: 'Dark', exact: true }))
    assert.deepEqual(errors, [])
  })

  test('T-UI-001 system follows OS changes and keeps the saved choice', async ({
    browserContext,
    assert,
  }) => {
    await browserContext.addCookies([{ name: 'dn_theme', value: 'system', url: baseURL }])
    const page = await browserContext.newPage()
    const errors = watchHydration(page)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto(pagePath, { waitUntil: 'networkidle' })
    await waitForTheme(page, 'dark')
    await page.getByRole('button', { name: 'Theme: System', exact: true }).click()
    await page.assertChecked(page.getByRole('menuitemradio', { name: 'System', exact: true }))
    await page.keyboard.press('Escape')
    await page.emulateMedia({ colorScheme: 'light' })
    await waitForTheme(page, 'light')
    await page.emulateMedia({ colorScheme: 'dark' })
    await waitForTheme(page, 'dark')
    const cookies = await browserContext.cookies(baseURL)
    assert.equal(cookies.find((cookie) => cookie.name === 'dn_theme')?.value, 'system')
    assert.deepEqual(errors, [])
  })

  test('T-UI-001 mobile menu changes the same preference', async ({ browserContext, assert }) => {
    const page = await browserContext.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(pagePath, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Open menu', exact: true }).click()
    const choices = page.getByRole('group', { name: 'Theme', exact: true })
    await choices.getByRole('button', { name: 'Dark', exact: true }).click()
    await waitForTheme(page, 'dark')
    assert.equal(
      await choices.getByRole('button', { name: 'Dark', exact: true }).getAttribute('aria-pressed'),
      'true'
    )
    const cookies = await browserContext.cookies(baseURL)
    assert.equal(cookies.find((cookie) => cookie.name === 'dn_theme')?.value, 'dark')
  })

  test('T-UI-001 theme controls work when localStorage is blocked', async ({
    browserContext,
    assert,
  }) => {
    await browserContext.addInitScript(() => {
      Object.defineProperty(globalThis, 'localStorage', {
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError')
        },
      })
    })
    const page = await browserContext.newPage()
    const errors = watchHydration(page)
    await page.goto(pagePath, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await waitForTheme(page, 'dark')
    const cookies = await browserContext.cookies(baseURL)
    assert.equal(cookies.find((cookie) => cookie.name === 'dn_theme')?.value, 'dark')
    assert.deepEqual(errors, [])
  })

  test('T-UI-001 focus refreshes a theme changed in another tab', async ({ browserContext }) => {
    const first = await browserContext.newPage()
    await first.goto(pagePath, { waitUntil: 'networkidle' })
    const second = await browserContext.newPage()
    await second.goto(pagePath, { waitUntil: 'networkidle' })
    await second.getByRole('button', { name: 'Theme: Light', exact: true }).click()
    await second.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await waitForTheme(second, 'dark')

    await first.bringToFront()
    // Headless Chromium does not emit native window focus on bringToFront.
    await first.evaluate("window.dispatchEvent(new Event('focus'))")
    await waitForTheme(first, 'dark')
    await first.assertVisible(first.getByRole('button', { name: 'Theme: Dark', exact: true }))
  })

  test('T-UI-001 theme preference has Secure on an HTTPS page', async ({
    browser,
    assert,
    cleanup,
  }) => {
    const secureOrigin = 'https://theme.test'
    const context = await browser.newContext({ baseURL: secureOrigin })
    cleanup(() => context.close())
    // Serve the actual app at an HTTPS browser origin without a separate TLS server.
    await context.route(`${secureOrigin}/**`, async (route) => {
      const requested = new URL(route.request().url())
      const response = await route.fetch({
        url: new URL(requested.pathname + requested.search, baseURL).href,
      })
      const contentType = response.headers()['content-type'] ?? ''
      if (contentType.includes('text/html') || contentType.includes('javascript')) {
        const body = await response.text()
        await route.fulfill({ response, body: body.replaceAll(baseURL, secureOrigin) })
      } else {
        await route.fulfill({ response })
      }
    })
    const page = await context.newPage()
    await page.goto(pagePath, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Theme: Light', exact: true }).click()
    await page.getByRole('menuitemradio', { name: 'Dark', exact: true }).click()
    await waitForTheme(page, 'dark')
    const cookies = await context.cookies(secureOrigin)
    const preference = cookies.find((cookie) => cookie.name === 'dn_theme')
    assert.equal(preference?.value, 'dark')
    assert.isTrue(preference?.secure)
  })

  test('T-UI-001 legacy preference migration and canonical precedence: {description}')
    .with([
      { description: 'legacy cookie', legacyCookie: 'dark', expected: 'dark' },
      { description: 'legacy localStorage', stored: 'dark', expected: 'dark' },
      {
        description: 'legacy cookie takes precedence over localStorage',
        legacyCookie: 'light',
        stored: 'dark',
        expected: 'light',
      },
      {
        description: 'invalid legacy cookie is ignored',
        legacyCookie: 'darkgarbage',
        stored: 'light',
        expected: 'light',
      },
      {
        description: 'canonical cookie takes precedence over both legacy values',
        canonical: 'light',
        legacyCookie: 'dark',
        stored: 'dark',
        expected: 'light',
      },
      {
        description: 'invalid canonical cookie falls back to light',
        canonical: 'darkgarbage',
        legacyCookie: 'dark',
        stored: 'dark',
        expected: 'light',
      },
    ] as {
      description: string
      canonical?: string
      legacyCookie?: string
      stored?: Theme
      expected: 'light' | 'dark'
    }[])
    .run(async ({ browserContext, assert }, { canonical, legacyCookie, stored, expected }) => {
      const cookies = []
      if (canonical) cookies.push({ name: 'dn_theme', value: canonical, url: baseURL })
      if (legacyCookie) cookies.push({ name: 'drip_theme', value: legacyCookie, url: baseURL })
      await browserContext.addCookies(cookies)
      if (stored) {
        await browserContext.addInitScript((value) => {
          localStorage.setItem('drip-ui-theme', value)
        }, stored)
      }

      // The first-paint script must work before the application bundle loads.
      await browserContext.route('**/*', (route) =>
        route.request().resourceType() === 'script' ? route.abort() : route.continue()
      )
      const page = await browserContext.newPage()
      const errors = watchHydration(page)
      await page.goto(pagePath)
      await waitForTheme(page, expected)
      const migrated = await browserContext.cookies(baseURL)
      assert.equal(
        migrated.find((cookie) => cookie.name === 'dn_theme')?.value,
        canonical ?? expected
      )

      await browserContext.unrouteAll({ behavior: 'wait' })
      const response = await page.reload({ waitUntil: 'networkidle' })
      assert.equal(response?.status(), 200)
      const html = await response!.text()
      assert.match(html, new RegExp(`<html\\b[^>]*\\bclass="${expected}"`))
      await page
        .getByRole('button', { name: `Theme: ${expected === 'light' ? 'Light' : 'Dark'}` })
        .click()
      await page.assertChecked(
        page.getByRole('menuitemradio', {
          name: expected === 'light' ? 'Light' : 'Dark',
          exact: true,
        })
      )
      assert.deepEqual(errors, [])
    })
})
