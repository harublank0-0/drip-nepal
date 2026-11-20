// Rules on the route table (docs/09 §1.2, §3.4, §12.3; docs/08 §13 RF-02
// and RF-40). Node built-ins only.
//
//   node scripts/check_routes.mjs [--routes <file> --production-routes <file>]
//
// Without files the script lists the routes itself, twice, with
// `node ace list:routes --json`: once in development, where
// start/routes.ts also imports start/routes/dev.ts, and once in production.
// It sets every variable a boot needs, with placeholder values and
// throwaway keys, so the lists are the same on a laptop and in CI; listing
// routes opens no connection. The script test passes saved copies.
// The development list holds every route, so rules 1 to 3 read it. It
// fails on:
// 1. T-SEC-005: a seller route (any route under `/seller/` or
//    `/api/v1/seller/shops/`) whose shop segment is not exactly
//    `:shopSlug`, or that lacks `sellerContext`; and `sellerContext` on
//    any other route;
// 2. T-SEC-037: `sellerContext` without `auth` before it;
// 3. T-UI-025: `guest` on a route other than the sign-in, sign-up and
//    password-reset pages and `logIn` (docs/09 §3.4 row 3), so no
//    storefront route sends a signed-in visitor away;
// 4. T-UI-026: a production route under `/dev` or named `dev.*`, and a
//    development-only route (listed in development, not in production)
//    outside `/dev` or not named `dev.*`: the first half finds a leaked
//    development route by that convention, the second keeps it true.
// A route listed for HEAD alone is read as HEAD, so no rule skips it. It
// exits 1 on a rule, and 2 on a usage error or when a listing fails.
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    'routes': { type: 'string' },
    'production-routes': { type: 'string' },
  },
})

if (Boolean(args.routes) !== Boolean(args['production-routes'])) {
  console.error('Pass both --routes and --production-routes, or neither.')
  process.exit(2)
}

// The shop segment of a seller route: the one after the prefix.
const SELLER_PREFIX = /^\/(?:api\/v1\/seller\/shops|seller)\/([^/]+)/
const GUEST_ROUTES = new Set([
  'GET /login',
  'GET /signup',
  'GET /forgot-password',
  'GET /reset-password',
  'POST /api/v1/auth/session',
])
const isDevRoute = (route) =>
  route.pattern === '/dev' ||
  route.pattern.startsWith('/dev/') ||
  (route.name ?? '').startsWith('dev.')

const key = () => randomBytes(32).toString('base64')

function listRoutes(env) {
  try {
    return execFileSync('node', ['ace', 'list:routes', '--json'], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (error) {
    console.error(
      `node ace list:routes failed under NODE_ENV=${env.NODE_ENV}:\n${error.stderr ?? error}`
    )
    process.exit(2)
  }
}

function readRoutes(json) {
  return JSON.parse(json)
    .flatMap((domain) => domain.routes)
    .map((route) => ({
      name: route.name || null,
      pattern: route.pattern,
      methods: route.methods.some((method) => method !== 'HEAD')
        ? route.methods.filter((method) => method !== 'HEAD')
        : route.methods,
      middleware: route.middleware
        .filter((entry) => entry.type === 'named')
        .map((entry) => entry.name),
    }))
}

let developmentJson
let productionJson
if (args.routes) {
  developmentJson = readFileSync(args.routes, 'utf8')
  productionJson = readFileSync(args['production-routes'], 'utf8')
} else {
  const boot = {
    TZ: 'UTC',
    HOST: 'localhost',
    PORT: '3333',
    LOG_LEVEL: 'warn',
    APP_NAME: 'route-check',
    APP_KEY: key(),
    SESSION_DRIVER: 'database',
    LIMITER_STORE: 'database',
    DRIVE_DISK: 'fs',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'route_check',
    DB_PASSWORD: key(),
    DB_DATABASE: 'route_check',
    DB_POOL_MAX: '2',
    DATA_ENCRYPTION_KEYS: `routes:${key()}`,
    DATA_ENCRYPTION_ACTIVE_KEY_ID: 'routes',
    BLIND_INDEX_KEY: key(),
    HMAC_KEY_LIMITER: key(),
    HMAC_KEY_AUDIT_IP: key(),
    HMAC_KEY_NOTIFY_ADDRESS: key(),
  }
  developmentJson = listRoutes({
    ...boot,
    NODE_ENV: 'development',
    APP_ENV: 'development',
    APP_URL: 'http://localhost:3333',
    DB_SSL: 'false',
  })
  productionJson = listRoutes({
    ...boot,
    NODE_ENV: 'production',
    APP_ENV: 'production',
    APP_URL: 'https://routes.invalid',
    APP_RELEASE: 'route-check',
    DB_SSL: 'true',
  })
}

const routes = readRoutes(developmentJson)
const production = readRoutes(productionJson)
const label = (route) => `${route.methods.join(',')} ${route.pattern}`
const problems = []

for (const route of routes) {
  const shopSegment = SELLER_PREFIX.exec(route.pattern)?.[1]
  const seller = shopSegment !== undefined
  const context = route.middleware.indexOf('sellerContext')
  if (seller && shopSegment !== ':shopSlug') {
    problems.push(`T-SEC-005 ${label(route)}: a seller route whose shop segment is not :shopSlug`)
  }
  if (seller && context === -1) {
    problems.push(`T-SEC-005 ${label(route)}: a seller route without sellerContext`)
  }
  if (!seller && context !== -1) {
    problems.push(`T-SEC-005 ${label(route)}: sellerContext on a route that is not a seller route`)
  }
  if (context !== -1) {
    const auth = route.middleware.indexOf('auth')
    if (auth === -1 || auth > context) {
      problems.push(`T-SEC-037 ${label(route)}: sellerContext without auth before it`)
    }
  }
  if (route.middleware.includes('guest')) {
    const allowed = route.methods.every((method) => GUEST_ROUTES.has(`${method} ${route.pattern}`))
    if (!allowed) {
      problems.push(
        `T-UI-025 ${label(route)}: guest is only for the sign-in, sign-up and reset pages and logIn`
      )
    }
  }
}

const inProduction = new Set(
  production.flatMap((route) => route.methods.map((method) => `${method} ${route.pattern}`))
)
for (const route of production) {
  if (isDevRoute(route)) {
    problems.push(`T-UI-026 ${label(route)}: a development route in the production route list`)
  }
}
for (const route of routes) {
  const developmentOnly = route.methods.some(
    (method) => !inProduction.has(`${method} ${route.pattern}`)
  )
  const conventional = route.pattern.startsWith('/dev/') && (route.name ?? '').startsWith('dev.')
  if (developmentOnly && !conventional) {
    problems.push(
      `T-UI-026 ${label(route)}: a development-only route belongs under /dev with a dev.* name (start/routes/dev.ts)`
    )
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log(
  `${routes.length} route(s) checked: seller routes run auth then sellerContext, ` +
    `guest is on the sign-in pages only, and production lists no development route`
)
