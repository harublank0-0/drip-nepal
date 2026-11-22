#!/usr/bin/env node
/*
 * Opens DripNepal pages in headless Chromium at phone and desktop widths, in
 * the light and dark themes, saves a screenshot of each, and reports what a
 * reviewer needs: HTTP status, console errors (hydration and CSP problems
 * show up there), page errors, and failed requests.
 *
 *   node .agents/skills/dripnepal-run/scripts/check_pages.cjs              # /dev/design-system
 *   node .agents/skills/dripnepal-run/scripts/check_pages.cjs --widths 390 /dev/design-system
 *
 * Options:
 *   --base <url>        Server to check (default http://localhost:3333)
 *   --widths 390,1280   Viewport widths in pixels (default 390,1280)
 *   --themes light,dark Themes to render (default light,dark)
 *   --out <dir>         Screenshot folder (default tmp/page-checks, gitignored)
 *   --login email:pass  Log in through the form at /auth/login before visiting the
 *                       pages (no login page exists until M1; check its path then)
 *   --dev-sign-in email Sign in through the development-only page /dev/sign-in
 *                       (docs/07 §3.13) as that demo or staff account
 *   --full              Whole-page screenshots (clipped to the screen width) instead of the first screen
 *   --scale 2           Device scale factor (default 1; use 2 for screenshots a person will see)
 *
 * Exits 1 if any page answers 4xx/5xx, throws, logs a console error, or a
 * request to the app's own host fails. Failed requests to other hosts (remote
 * images, fonts) are listed separately and don't fail the run,
 * because a cloud session's network policy often blocks them.
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

function loadPlaywright() {
  try {
    return require('playwright')
  } catch {}
  // pnpm installs Playwright for @japa/browser-client under node_modules/.pnpm.
  const store = path.resolve('node_modules/.pnpm')
  const dir = fs.existsSync(store)
    ? fs.readdirSync(store).find((name) => name.startsWith('playwright@'))
    : undefined
  if (dir) return require(path.join(store, dir, 'node_modules/playwright'))
  console.error(
    'Playwright not found. Run this from the repository root after `pnpm install`, ' +
      'or install it: npm i -g playwright@1.61.1 && npx playwright install chromium'
  )
  process.exit(2)
}

function parseArgs(argv) {
  const options = {
    base: 'http://localhost:3333',
    widths: [390, 1280],
    themes: ['light', 'dark'],
    out: 'tmp/page-checks',
    login: null,
    devSignIn: null,
    full: false,
    scale: 1,
    paths: [],
  }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => argv[++i]
    if (arg === '--base') options.base = next().replace(/\/$/, '')
    else if (arg === '--widths') options.widths = next().split(',').map(Number)
    else if (arg === '--themes') options.themes = next().split(',')
    else if (arg === '--out') options.out = next()
    else if (arg === '--login') options.login = next()
    else if (arg === '--dev-sign-in') options.devSignIn = next()
    else if (arg === '--full') options.full = true
    else if (arg === '--scale') options.scale = Number(next())
    else if (arg.startsWith('--')) throw new Error(`Unknown option ${arg}`)
    else options.paths.push(arg)
  }
  // The one page today (development only); the storefront returns with M4.
  if (options.paths.length === 0) options.paths = ['/dev/design-system']
  return options
}

/*
 * Runs in the page. When the page is wider than the screen, names the
 * elements that make it so, with the usual fix for each:
 * - an absolutely positioned element past the edge (often an sr-only label)
 *   escaping an overflow box that isn't `relative`;
 * - a flex item with min-width: auto growing to its content (needs min-w-0);
 * - a grid with an automatic track growing to its content (needs grid-cols-1);
 * - otherwise the deepest element past the edge outside any scroll box.
 */
function findOverflow() {
  const width = window.innerWidth
  const scrollWidth = document.documentElement.scrollWidth
  if (scrollWidth <= width + 1) return null

  const past = (el) => el.getBoundingClientRect().right > width + 1
  const name = (el) => {
    const classes = String(el.className).trim().split(/\s+/).slice(0, 6).join('.')
    const text = (el.innerText || el.textContent || '').trim().slice(0, 30).replace(/\s+/g, ' ')
    return `<${el.tagName.toLowerCase()}${classes ? '.' + classes : ''}>${text ? ` "${text}"` : ''}`
  }
  const inScrollBox = (el) => {
    for (let a = el.parentElement; a; a = a.parentElement) {
      if (['auto', 'scroll', 'hidden'].includes(getComputedStyle(a).overflowX)) return true
    }
    return false
  }
  const causes = []
  const all = [...document.querySelectorAll('body *')].filter(past)

  for (const el of all) {
    const style = getComputedStyle(el)
    if ((style.position === 'absolute' || style.position === 'fixed') && inScrollBox(el)) {
      causes.push(
        `${name(el)} is position:${style.position} and escapes its scroll box: make the box \`relative\``
      )
    }
  }
  for (const el of all) {
    const parent = el.parentElement
    if (!parent || past(parent)) continue
    const style = getComputedStyle(el)
    const parentStyle = getComputedStyle(parent)
    if (parentStyle.display.includes('flex') && style.minWidth === 'auto') {
      causes.push(
        `${name(el)} is a flex item with min-width:auto, grown to its content: add \`min-w-0\``
      )
    } else if (parentStyle.display.includes('grid')) {
      causes.push(
        `${name(el)} sits in a grid whose track grew to its content: give the grid \`grid-cols-1\` (minmax(0,1fr))`
      )
    }
  }
  if (causes.length === 0) {
    const leaves = all.filter((el) => !inScrollBox(el) && ![...el.children].some(past))
    for (const el of leaves.slice(0, 3)) causes.push(`${name(el)} passes the right edge`)
  }
  return { scrollWidth, causes: [...new Set(causes)].slice(0, 5) }
}

function slugFor(pagePath) {
  return pagePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'home'
}

// The development-only sign-in (docs/07 §3.13): one click on the account's button.
async function devSignIn(context, base, email) {
  const page = await context.newPage()
  await page.goto(`${base}/dev/sign-in`)
  await page.getByRole('button', { name: `Sign in as ${email}` }).click()
  try {
    await page.getByText(`Signed in as ${email}`).waitFor({ timeout: 15000 })
  } catch (error) {
    await page.screenshot({ path: 'tmp/page-checks/dev-sign-in-failed.png' })
    throw error
  }
  await page.close()
}

async function logIn(context, base, credentials) {
  const separator = credentials.indexOf(':')
  const email = credentials.slice(0, separator)
  const password = credentials.slice(separator + 1)
  const page = await context.newPage()
  // Two tries: in development a file change can reload the page mid-login.
  for (let attempt = 1; attempt <= 2; attempt++) {
    await page.goto(`${base}/auth/login`)
    await page.fill('input[name="email"]', email)
    await page.fill('input[name="password"]', password)
    try {
      await Promise.all([
        page.waitForURL((url) => !url.pathname.startsWith('/auth/login'), { timeout: 15000 }),
        page.click('button[type="submit"]'),
      ])
      await page.close()
      return
    } catch (error) {
      if (attempt === 2) {
        // Show what the login page says: wrong password, rate limit, suspended account.
        const text = await page
          .locator('[role="alert"]')
          .allInnerTexts()
          .then((texts) => texts.join(' ').slice(0, 300))
          .catch(() => '')
        throw new Error(`Login as ${email} failed; the page says: ${text || '(nothing)'}`, {
          cause: error,
        })
      }
    }
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const { chromium } = loadPlaywright()
  const appHost = new URL(options.base).host
  fs.mkdirSync(options.out, { recursive: true })

  const browser = await chromium.launch()
  const results = []

  for (const theme of options.themes) {
    for (const width of options.widths) {
      const context = await browser.newContext({
        viewport: { width, height: width < 768 ? 844 : 900 },
        deviceScaleFactor: options.scale,
      })
      // The server renders the theme from the dn_theme cookie (docs/08 §1.2,
      // light when unset), so the cookie picks it before the first request.
      await context.addCookies([{ name: 'dn_theme', value: theme, url: options.base }])
      if (options.login) await logIn(context, options.base, options.login)
      if (options.devSignIn) await devSignIn(context, options.base, options.devSignIn)

      for (const pagePath of options.paths) {
        const page = await context.newPage()
        const problems = []
        const external = []
        page.on('console', (message) => {
          if (message.type() !== 'error') return
          // The browser also logs each failed resource; a failure on another
          // host is already listed under external requests below.
          const source = message.location()?.url
          if (message.text().startsWith('Failed to load resource') && source) {
            try {
              if (new URL(source).host !== appHost) return
            } catch {}
          }
          problems.push(`console: ${message.text()}`)
        })
        page.on('pageerror', (error) => problems.push(`page error: ${error.message}`))
        page.on('requestfailed', (request) => {
          const url = new URL(request.url())
          const reason = request.failure()?.errorText ?? 'failed'
          const line = `${reason} ${url.host}${url.pathname}`
          // A Content-Security-Policy block is a real bug whatever the host.
          if (url.host === appHost || reason.includes('BLOCKED_BY_CSP'))
            problems.push(`request: ${line}`)
          else external.push(line)
        })
        page.on('response', (response) => {
          const url = new URL(response.url())
          if (
            url.host === appHost &&
            response.status() >= 400 &&
            response.request().resourceType() !== 'document'
          ) {
            problems.push(`request: ${response.status()} ${url.pathname}`)
          }
        })

        const response = await page.goto(`${options.base}${pagePath}`, { waitUntil: 'networkidle' })
        const status = response ? response.status() : 0
        if (status >= 400 || status === 0) problems.push(`HTTP ${status}`)
        const file = path.join(options.out, `${slugFor(pagePath)}-${width}-${theme}.png`)
        // A full-page capture widens to the page's scroll width, which would show
        // an overflowing page as a tidy wide layout. Clip it to the screen width,
        // so the screenshot shows what a phone shows.
        const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight)
        await page.screenshot(
          options.full
            ? { path: file, fullPage: true, clip: { x: 0, y: 0, width, height: pageHeight } }
            : { path: file }
        )
        const overflow = await page.evaluate(findOverflow)
        if (overflow) {
          problems.push(`page scrolls sideways at this width (${overflow.scrollWidth}px wide)`)
          for (const cause of overflow.causes) problems.push(`  wide: ${cause}`)
        }
        results.push({ pagePath, width, theme, status, file, problems, external })
        await page.close()
      }
      await context.close()
    }
  }
  await browser.close()

  let failed = false
  for (const result of results) {
    const mark = result.problems.length ? 'FAIL' : 'ok  '
    if (result.problems.length) failed = true
    console.log(
      `${mark} ${result.status} ${result.pagePath} @${result.width} ${result.theme} -> ${result.file}`
    )
    for (const problem of result.problems) console.log(`       ${problem}`)
    if (result.external.length) {
      const hosts = [...new Set(result.external.map((line) => line.split(' ')[1].split('/')[0]))]
      console.log(
        `       external requests failed (not counted): ${result.external.length} to ${hosts.join(', ')}`
      )
    }
  }
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error(error)
  process.exit(2)
})
