import { test } from '@japa/runner'
import env from '#start/env'
import { csp } from '#config/shield'
import { NONCE } from '#modules/platform/content_security_policy'
import { THEME_COLORS } from '#shared/ui/theme'

/*
 * T-UI-001: the server writes the theme class on <html> from the
 * `dn_theme` cookie (docs/08 §1.2, docs/09 §13.10), so a page shows the
 * chosen theme before any JavaScript runs, or with none (RF-08). Checked on
 * the HTML the server sends, which is all a browser without JavaScript
 * gets, for a server-rendered page (the 404 page) and a browser-rendered
 * one (the development gallery): the root view writes the class for both.
 */

const base = () => `http://${env.get('HOST')}:${env.get('PORT')}`
const PAGES = ['/no-such-page', '/dev/design-system']

async function html(path: string, cookie?: string) {
  const response = await fetch(`${base()}${path}`, {
    headers: cookie === undefined ? {} : { Cookie: `dn_theme=${cookie}` },
  })
  return response.text()
}

const htmlTag = (page: string) => page.match(/<html[^>]*>/)?.[0] ?? ''
const themeScript = (page: string) => /<script[^>]*>[^<]*prefers-color-scheme/.test(page)
const themeColors = (page: string) =>
  [...page.matchAll(/<meta name="theme-color"([^>]*)>/g)].map((match) => match[1].trim())
const themeProp = (page: string) =>
  page.match(/&quot;theme&quot;:&quot;(\w+)&quot;|"theme":"(\w+)"/)

test.group('T-UI-001 the theme class from the dn_theme cookie', () => {
  test('T-UI-001 {cookie} gives <html class="{expected}"> on {path}')
    .with(
      PAGES.flatMap((path) => [
        { path, cookie: '(none)', send: undefined, expected: 'light' },
        { path, cookie: 'light', send: 'light', expected: 'light' },
        { path, cookie: 'dark', send: 'dark', expected: 'dark' },
        { path, cookie: 'an unknown value', send: 'purple', expected: 'light' },
      ])
    )
    .run(async ({ assert }, { path, send, expected }) => {
      const page = await html(path, send)
      assert.equal(htmlTag(page), `<html lang="en" class="${expected}">`)
      assert.isFalse(themeScript(page), 'no inline theme script')
      const prop = themeProp(page)
      assert.equal(prop?.[1] ?? prop?.[2], expected, 'the theme page prop')
      assert.deepEqual(themeColors(page), [
        `content="${THEME_COLORS[expected as 'light' | 'dark']}" /`,
      ])
    })

  test('T-UI-001 system leaves the class to the inline script on {path}')
    .with(PAGES.map((path) => ({ path })))
    .run(async ({ assert }, { path }) => {
      const page = await html(path, 'system')
      assert.equal(htmlTag(page), '<html lang="en" class="">')
      assert.isTrue(themeScript(page), 'the inline theme script')
      const head = page.slice(0, page.indexOf('</head>'))
      assert.isTrue(themeScript(head), 'the script runs in <head>, before first paint')
      // CSP is off outside production; the attribute is what production fills.
      assert.match(head, /<script nonce="[^"]*">[^<]*prefers-color-scheme/)
      // The browser picks the chrome colour from the colour scheme.
      assert.deepEqual(themeColors(head), [
        `content="${THEME_COLORS.light}" media="(prefers-color-scheme: light)" /`,
        `content="${THEME_COLORS.dark}" media="(prefers-color-scheme: dark)" /`,
      ])
    })

  test('T-UI-001 the production CSP lets the nonce-carrying theme script run', ({ assert }) => {
    // config/shield.ts: both policies, outside development (docs/07 §7.3).
    assert.includeMembers([...csp.enforced.scriptSrc], ["'self'", NONCE])
    assert.includeMembers([...csp.target.scriptSrc], ["'self'", NONCE])
  })
})
