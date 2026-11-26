// Checks on the production build output (docs/08 §10.1, docs/09 §13.8).
// Node built-ins only.
//
//   node scripts/check_bundle.mjs [--assets <dir>] [--config <file>]
//
// `--assets` is the built `public/assets` folder (default
// build/public/assets, after `node ace build`); `--config` is the file that
// declares SSR_SURFACES (default config/inertia.ts). The fixture tests in
// tests/unit/scripts/check_bundle.spec.ts point both at a fixture tree.
//
// - T-UI-012: a route's initial JavaScript, gzip-compressed, is within its
//   budget: 250 KB for a storefront route, 500 KB for a seller or admin
//   route (1 KB = 1,000 bytes, as Vite reports sizes). Initial JavaScript is
//   the client entry (inertia/app.tsx) and the page's chunk, with every
//   chunk they import statically, as Vite's manifest lists them, and the
//   chunks of what inertia/app.tsx loads with the page before it renders:
//   its surface's layout (`inertia/layouts/<surface>_layout.tsx`) and
//   catalog (`resources/lang/en/<surface>.json`) when they are dynamic
//   imports, `<surface>` being the page name's first segment. A layout or
//   catalog loaded on demand that no page counts fails, so one named
//   otherwise cannot go uncounted. A storefront route never loads a
//   dashboard layout (seller, admin), and a dashboard layout is a chunk
//   loaded on demand: a static import would put it in every page.
// - T-UI-013: no devtools code in the build: no file holds the strings
//   `TanStackDevtools` or `react-form-devtools`.
// - T-ARCH-002 (rule 4's build-output part): the SSR bundle holds only the
//   pages of the server-rendered surfaces, the SSR_SURFACES of
//   config/inertia.ts.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

const { values: args } = parseArgs({
  options: {
    assets: { type: 'string', default: 'build/public/assets' },
    config: { type: 'string', default: 'config/inertia.ts' },
  },
})
const assets = resolve(args.assets)
const ENTRY = 'inertia/app.tsx'
const SSR_ENTRY = 'inertia/ssr.tsx'
const KB = 1000
const BUDGETS = { storefront: 250 * KB, dashboard: 500 * KB }
const DASHBOARD = /^(seller|admin)\//
const DASHBOARD_LAYOUTS = ['inertia/layouts/seller_layout.tsx', 'inertia/layouts/admin_layout.tsx']
const DEVTOOLS = ['TanStackDevtools', 'react-form-devtools']

const problems = []
const report = []

function readManifest(directory) {
  const path = join(directory, '.vite', 'manifest.json')
  if (!existsSync(path)) {
    process.stderr.write(`${path} is missing: run node ace build first\n`)
    process.exit(1)
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

// T-UI-012
const manifest = readManifest(assets)
if (!manifest[ENTRY]?.isEntry) problems.push(`the client manifest has no ${ENTRY} entry`)

function staticClosure(key, seen = new Set()) {
  if (seen.has(key)) return seen
  if (!manifest[key]) {
    problems.push(`the client manifest imports ${key}, which it does not list`)
    return seen
  }
  seen.add(key)
  for (const imported of manifest[key].imports ?? []) staticClosure(imported, seen)
  return seen
}

const gzipped = new Map()
function gzipSize(file) {
  if (!gzipped.has(file)) gzipped.set(file, gzipSync(readFileSync(join(assets, file))).length)
  return gzipped.get(file)
}

const pages = Object.keys(manifest).filter((key) => /^inertia\/pages\/.+\.tsx$/.test(key))
if (pages.length === 0) problems.push('the client manifest lists no page under inertia/pages/')
// The layouts and catalogs loaded on demand that some page counts.
const counted = new Set()
for (const page of pages) {
  const name = page.slice('inertia/pages/'.length, -'.tsx'.length)
  const surface = DASHBOARD.test(name) ? 'dashboard' : 'storefront'
  const first = name.split('/')[0]
  // What app.tsx loads with this page: its surface's layout and catalog, when they are dynamic.
  const withPage = [
    `inertia/layouts/${first}_layout.tsx`,
    `resources/lang/en/${first}.json`,
  ].filter((key) => manifest[key]?.isDynamicEntry)
  for (const key of withPage) counted.add(key)
  const keys = new Set([ENTRY, page, ...withPage].flatMap((key) => [...staticClosure(key)]))
  const files = new Set()
  for (const key of keys) {
    if (manifest[key].file.endsWith('.js')) files.add(manifest[key].file)
  }
  if (surface === 'storefront') {
    for (const layout of DASHBOARD_LAYOUTS.filter((key) => keys.has(key))) {
      problems.push(`T-UI-012: ${name} loads the dashboard layout ${layout}`)
    }
  }
  const size = [...files].reduce((total, file) => total + gzipSize(file), 0)
  const budget = BUDGETS[surface]
  report.push(`${name}: ${(size / KB).toFixed(1)} KB of ${budget / KB} KB (${surface})`)
  if (size > budget) {
    problems.push(
      `T-UI-012: ${name} loads ${(size / KB).toFixed(1)} KB of JavaScript (gzip), over the ${surface} budget of ${budget / KB} KB`
    )
  }
}

for (const key of Object.keys(manifest)) {
  if (/^(inertia\/layouts\/|resources\/lang\/)/.test(key) && manifest[key].isDynamicEntry) {
    if (!counted.has(key)) {
      problems.push(
        `T-UI-012: ${key} is loaded on demand but no page counts it: name it inertia/layouts/<surface>_layout.tsx or resources/lang/en/<surface>.json for the pages of <surface>/`
      )
    }
  }
}
for (const layout of DASHBOARD_LAYOUTS) {
  const surface = layout.slice('inertia/layouts/'.length, -'_layout.tsx'.length)
  const used = pages.some((page) => page.startsWith(`inertia/pages/${surface}/`))
  if (used && !manifest[layout]?.isDynamicEntry) {
    problems.push(
      `T-UI-012: ${layout} is not a chunk loaded on demand: imported statically, or renamed, it would be in every page's JavaScript; load it with its surface (inertia/layouts/layout_for.ts)`
    )
  }
}

// T-UI-013
function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (/\.(m?js|css|html)$/.test(entry.name)) files.push(path)
  }
  return files
}
for (const file of walk(assets)) {
  const text = readFileSync(file, 'utf8')
  for (const needle of DEVTOOLS) {
    if (text.includes(needle)) {
      problems.push(`T-UI-013: ${file.slice(assets.length + 1)} contains ${needle}`)
    }
  }
}

// T-ARCH-002, the SSR bundle
const surfaces = [
  ...(
    /SSR_SURFACES\s*=\s*\[([^\]]*)\]/.exec(readFileSync(resolve(args.config), 'utf8'))?.[1] ?? ''
  ).matchAll(/'([^']+)'/g),
].map((match) => match[1])
if (surfaces.length === 0) problems.push(`no SSR_SURFACES list in ${args.config}`)
const server = join(assets, 'server')
const ssrFile = readManifest(server)[SSR_ENTRY]?.file
if (!ssrFile) {
  problems.push(`the SSR manifest has no ${SSR_ENTRY} entry`)
} else {
  const ssrPages = [
    ...new Set(
      [
        ...readFileSync(join(server, ssrFile), 'utf8').matchAll(
          /["']\.\/pages\/([^"']+)\.tsx["']/g
        ),
      ].map((match) => match[1])
    ),
  ]
  if (ssrPages.length === 0) problems.push(`T-ARCH-002: the SSR bundle ${ssrFile} holds no page`)
  for (const page of ssrPages) {
    if (!surfaces.some((surface) => page.startsWith(surface))) {
      problems.push(
        `T-ARCH-002: the SSR bundle holds ${page}, outside the server-rendered surfaces (${surfaces.join(', ')})`
      )
    }
  }
  report.push(`SSR bundle: ${ssrPages.length} page(s), all in ${surfaces.join(', ')}`)
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${report.join('\n')}\nno devtools strings in the build\n`)
