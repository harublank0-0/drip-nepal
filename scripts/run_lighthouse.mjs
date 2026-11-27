// T-PERF-003 (docs/10 §6, docs/08 §10.1, docs/11 §12.3): Lighthouse on the
// storefront pages, report only.
//
//   node scripts/run_lighthouse.mjs --base <url> [--out <dir>] [--runs <n>] [path ...]
//
// Without paths it measures the home page `/`, the listing `/men` and the
// first product page the home page links to. Each page is measured --runs
// times (default 3) with Lighthouse's mobile defaults (a mid-range phone:
// simulated slow 4G and a 4× slower CPU), and the run with the median
// performance score is reported.
//
// The app is reached through a gzip proxy started here: production's Caddy
// compresses responses (`encode zstd gzip`, docker/Caddyfile) and the app
// does not, so without it the transfer sizes would be those of no proxy.
// Chrome offers zstd over HTTPS only, so plain-HTTP gzip is the closer
// stand-in. Product photos come from MEDIA_PUBLIC_URL, outside the proxy.
//
// It writes <out>/<page>.report.html and .json for each reported run and a
// Markdown table, to stdout and to $GITHUB_STEP_SUMMARY when set, beside the
// budgets of docs/08 §10.1. A missed budget is reported, never failed; the
// script exits 1 only when a page cannot be measured. Lighthouse runs with
// error reporting off, so nothing is sent to a third party.
import { spawn } from 'node:child_process'
import { appendFileSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { createServer, request } from 'node:http'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createGzip } from 'node:zlib'

const { values: args, positionals } = parseArgs({
  options: {
    base: { type: 'string' },
    out: { type: 'string', default: 'tmp/lighthouse' },
    runs: { type: 'string', default: '3' },
  },
  allowPositionals: true,
})
if (!args.base) {
  process.stderr.write(
    'usage: node scripts/run_lighthouse.mjs --base <url> [--out <dir>] [--runs <n>] [path ...]\n'
  )
  process.exit(2)
}
const base = new URL(args.base)
const out = resolve(args.out)
const runs = Math.max(1, Number.parseInt(args.runs, 10) || 1)
const LIGHTHOUSE = resolve('node_modules/.bin/lighthouse')

// docs/08 §10.1. INP needs a person's input, so a lab run reports Total Blocking Time beside it.
const KB = 1024
const BUDGETS = { lcp: 2500, tbt: 200, cls: 0.1, transfer: 1024 * KB }

// Text responses are gzip-compressed for a client that accepts it, as Caddy's `encode` does.
const COMPRESSIBLE = /^(text\/|application\/(javascript|json|manifest\+json|xml)|image\/svg\+xml)/

function startProxy() {
  const server = createServer((incoming, outgoing) => {
    const upstream = request(
      new URL(incoming.url ?? '/', base),
      { method: incoming.method, headers: { ...incoming.headers, host: base.host } },
      (response) => {
        response.on('error', () => outgoing.destroy())
        const headers = { ...response.headers }
        const type = String(headers['content-type'] ?? '')
        const accepts = /\bgzip\b/.test(String(incoming.headers['accept-encoding'] ?? ''))
        const body = incoming.method !== 'HEAD' && ![204, 304].includes(response.statusCode ?? 0)
        if (body && accepts && COMPRESSIBLE.test(type) && !headers['content-encoding']) {
          delete headers['content-length']
          headers['content-encoding'] = 'gzip'
          // The compressed bytes differ, so a strong ETag becomes weak, as a compressing proxy does.
          if (headers.etag && !headers.etag.startsWith('W/')) headers.etag = `W/${headers.etag}`
          headers.vary = headers.vary ? `${headers.vary}, Accept-Encoding` : 'Accept-Encoding'
          outgoing.writeHead(response.statusCode ?? 502, headers)
          response.pipe(createGzip()).pipe(outgoing)
        } else {
          outgoing.writeHead(response.statusCode ?? 502, headers)
          response.pipe(outgoing)
        }
      }
    )
    upstream.on('error', (error) => {
      outgoing.writeHead(502)
      outgoing.end(String(error))
    })
    incoming.pipe(upstream)
  })
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done(server))
  })
}

// One Lighthouse run of `url`, its report files at `<prefix>.report.{json,html}`. It runs
// asynchronously: the proxy in this process answers Chrome while it runs.
async function lighthouse(url, prefix) {
  const child = spawn(
    LIGHTHOUSE,
    [
      url,
      '--quiet',
      '--only-categories=performance',
      '--output=json',
      '--output=html',
      `--output-path=${prefix}`,
      '--no-enable-error-reporting',
      '--chrome-flags=--headless=new --no-sandbox',
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] }
  )
  const exit = await new Promise((done) => {
    child.on('error', (error) => done(String(error)))
    child.on('close', (code, signal) => done(code ?? signal))
  })
  if (exit !== 0) return { error: `Lighthouse exited with ${exit}` }
  const report = JSON.parse(readFileSync(`${prefix}.report.json`, 'utf8'))
  if (report.runtimeError)
    return { error: `${report.runtimeError.code}: ${report.runtimeError.message}` }
  // A run without a score or one of the metrics is a failed run, never a row of blanks.
  const score = report.categories.performance.score
  if (typeof score !== 'number') return { error: 'no performance score' }
  const metrics = {
    lcp: 'largest-contentful-paint',
    tbt: 'total-blocking-time',
    cls: 'cumulative-layout-shift',
    transfer: 'total-byte-weight',
  }
  const result = { score: Math.round(score * 100) }
  for (const [name, id] of Object.entries(metrics)) {
    const value = report.audits[id]?.numericValue
    if (!Number.isFinite(value)) return { error: `no ${id}` }
    result[name] = value
  }
  return result
}

const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`
const mark = (text, over) => (over ? `${text} (over)` : text)

const server = await startProxy()
const proxy = `http://127.0.0.1:${server.address().port}`
let failed = false
try {
  mkdirSync(out, { recursive: true })
  let pages = positionals.map((path) => ({
    name: path.replace(/[^a-z0-9]+/gi, '_') || 'home',
    path,
  }))
  if (pages.length === 0) {
    const home = await fetch(`${proxy}/`).then((response) => response.text())
    const product = home.match(/href="(\/p\/[^"?#]+)"/)?.[1]
    if (!product) throw new Error('the home page links to no product: is the catalogue seeded?')
    pages = [
      { name: 'home', path: '/' },
      { name: 'listing', path: '/men' },
      { name: 'product', path: product },
    ]
  }

  const rows = []
  for (const page of pages) {
    const measured = []
    for (let run = 1; run <= runs; run++) {
      const prefix = join(out, `${page.name}-${run}`)
      const result = await lighthouse(`${proxy}${page.path}`, prefix)
      if (result.error) {
        failed = true
        rows.push(`| \`${page.path}\` | failed: ${result.error} | | | | | |`)
        break
      }
      measured.push({ ...result, prefix })
    }
    if (measured.length < runs) continue
    // The run with the median performance score is reported; the others' files are removed.
    measured.sort((a, b) => a.score - b.score)
    const median = measured[Math.floor(measured.length / 2)]
    for (const run of measured) {
      for (const extension of ['json', 'html']) {
        const file = `${run.prefix}.report.${extension}`
        if (run === median) renameSync(file, join(out, `${page.name}.report.${extension}`))
        else rmSync(file)
      }
    }
    const listing = page.name === 'listing'
    const cells = [
      `\`${page.path}\``,
      median.score,
      mark(seconds(median.lcp), median.lcp > BUDGETS.lcp),
      mark(`${Math.round(median.tbt)} ms`, median.tbt > BUDGETS.tbt),
      mark(median.cls.toFixed(3), median.cls > BUDGETS.cls),
      mark(`${Math.round(median.transfer / KB)} KB`, listing && median.transfer > BUDGETS.transfer),
    ]
    rows.push(`| ${cells.join(' | ')} |`)
  }

  const summary = [
    `### Lighthouse, mobile (T-PERF-003, report only)`,
    '',
    `Median of ${runs} run(s) per page; simulated slow 4G and a 4× slower CPU. Budgets (docs/08 §10.1): LCP ≤ 2.5 s, CLS ≤ 0.1, the listing's first-load transfer ≤ 1 MB; INP ≤ 200 ms needs real input, so Total Blocking Time stands in for it here.`,
    '',
    `A lab run, unlike production: HTTP/1.1 without TLS behind a gzip proxy (Caddy serves HTTP/2 over TLS), the runner's Chrome, a synthetic catalogue, and development mode, which has no CSP. Compare its figures from run to run, not with field data.`,
    '',
    '| Page | Score | LCP | TBT | CLS | Transfer |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n')
  process.stdout.write(`${summary}\n`)
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`)
} catch (error) {
  failed = true
  process.stderr.write(`T-PERF-003: ${error instanceof Error ? error.message : String(error)}\n`)
} finally {
  server.close()
}
process.exit(failed ? 1 : 0)
