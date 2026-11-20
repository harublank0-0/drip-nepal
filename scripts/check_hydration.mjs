// T-ARCH-002 (docs/03 §3.3, docs/09 §13.8): a running production server
// renders its server-rendered pages without `X-Inertia`, and React hydrates
// them in a browser with no error or warning.
//
//   node scripts/check_hydration.mjs [--base <url>]
//
// The page is the 404 page of an unknown URL, the one server-rendered page a
// production build serves before M1. For each theme (no cookie, `dark`, and
// `system` under a light and a dark colour scheme) it checks:
// 1. the HTML answer: status 404, the page object as a JSON data block, and
//    `#app` already holding the rendered page;
// 2. in headless Chromium: React's root appears on `#app` and no node the
//    server rendered into `#app` is removed, so React adopted the markup
//    (hydrateRoot) instead of painting again (createRoot clears the
//    container, RF-08; so does a hydration error's client-side fallback),
//    no console error or warning and no page error, the theme class on
//    <html>, and the chrome colour of the theme-color tags.
// CI runs it against the production image (scripts/check_image.sh) after
// installing Chromium (`pnpm exec playwright install chromium`).
import { parseArgs } from 'node:util'
import { chromium } from 'playwright'

const { values: args } = parseArgs({
  options: { base: { type: 'string', default: 'http://127.0.0.1:3399' } },
})
const url = new URL('/t-arch-002-no-such-page', args.base).href
// THEME_COLORS of shared/ui/theme.ts, which T-UI-001 ties to the root view.
const COLORS = { light: '#ffffff', dark: '#09090b' }
const CASES = [
  { label: 'no cookie', cookie: null, scheme: 'light', expected: 'light' },
  { label: 'dark', cookie: 'dark', scheme: 'light', expected: 'dark' },
  { label: 'system, light scheme', cookie: 'system', scheme: 'light', expected: 'light' },
  { label: 'system, dark scheme', cookie: 'system', scheme: 'dark', expected: 'dark' },
]

const problems = []

// 1. The server's answer, as any client without JavaScript gets it.
const response = await fetch(url, { headers: { Accept: 'text/html' } })
const html = await response.text()
if (response.status !== 404) problems.push(`${url} answered ${response.status}, not 404`)
if (response.headers.get('x-inertia')) problems.push('the HTML answer carries X-Inertia')
if (!/<script data-page="app" type="application\/json">/.test(html)) {
  problems.push('the page object is not a JSON data block')
}
if (!/<div(?=[^>]*\bid="app")(?=[^>]*\bdata-server-rendered="true")[^>]*>\s*<[a-z]/i.test(html)) {
  problems.push('#app is empty: the server did not render the page')
}

// 2. Hydration in a browser.
const browser = await chromium.launch()
try {
  for (const { label, cookie, scheme, expected } of CASES) {
    const context = await browser.newContext({ colorScheme: scheme })
    if (cookie) await context.addCookies([{ name: 'dn_theme', value: cookie, url }])
    const page = await context.newPage()
    // Counts the nodes removed from #app from the first byte of the document:
    // the parser only adds them, and hydration keeps them.
    await page.addInitScript(() => {
      window.__appRemovals = 0
      new MutationObserver((records) => {
        for (const record of records) {
          if (record.target.id === 'app') window.__appRemovals += record.removedNodes.length
        }
      }).observe(document, { childList: true, subtree: true })
    })
    const messages = []
    page.on('console', (message) => {
      // The page itself answers 404 on purpose, and Chromium logs that.
      const ownStatus = message.location().url === url && message.text().includes('status of 404')
      if (!ownStatus && (message.type() === 'error' || message.type() === 'warning')) {
        messages.push(`console ${message.type()}: ${message.text()}`)
      }
    })
    page.on('pageerror', (error) => messages.push(`page error: ${error.message}`))
    await page.goto(url, { waitUntil: 'load' })
    const hydrated = await page
      .waitForFunction(
        () =>
          Object.keys(document.querySelector('#app') ?? {}).some((key) =>
            key.startsWith('__reactContainer$')
          ),
        undefined,
        { timeout: 10_000 }
      )
      .then(() => true)
      .catch(() => false)
    // A hydration mismatch is reported after the first commit.
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => ({
      removals: window.__appRemovals,
      className: document.documentElement.className,
      chrome: [...document.querySelectorAll('meta[name="theme-color"]')]
        .filter((meta) => !meta.media || matchMedia(meta.media).matches)
        .map((meta) => meta.getAttribute('content')),
    }))
    if (!hydrated) problems.push(`${label}: React did not start on #app within 10 s`)
    if (state.removals !== 0) {
      problems.push(
        `${label}: ${state.removals} server-rendered node(s) removed from #app: React painted again instead of hydrating`
      )
    }
    for (const message of messages) problems.push(`${label}: ${message}`)
    if (state.className !== expected) {
      problems.push(`${label}: <html class="${state.className}">, expected "${expected}"`)
    }
    if (state.chrome.join() !== COLORS[expected]) {
      problems.push(
        `${label}: theme-color ${state.chrome.join() || '(none)'}, expected ${COLORS[expected]}`
      )
    }
    await context.close()
  }
} finally {
  await browser.close()
}

if (problems.length > 0) {
  process.stderr.write(`T-ARCH-002:\n${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(
  `T-ARCH-002: ${url} is server-rendered and hydrates with no error in ${CASES.length} theme cases\n`
)
