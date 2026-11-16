// T-API-010: route parity between the `/api/v1` routes and docs/openapi.yaml
// (docs/09 §4.5). Node built-ins only.
//
//   node scripts/check_api_contract.mjs [--spec <file>] [--routes <file>]
//
// The routes come from `node ace list:routes --json` (or a saved copy with
// --routes, as the script test passes); the spec's `paths`, operationIds,
// `x-foundation-scope` and `x-pending-operations` are read from the YAML,
// which Prettier keeps in one layout. It fails on:
// 1. an `/api/v1` route (method and pattern) with no operation in `paths`;
// 2. a route whose name is not its operation's operationId;
// 3. an operationId in `x-pending-operations` that also has a path;
// 4. an operation in `paths` without a route, unless the operation is in
//    `x-foundation-scope`: the foundation contract specifies those before
//    they are built (openapi.yaml `info.description`), so they are listed
//    as "specified, not built yet" instead.
// Path parameters compare by position: `:shopSlug` and `{shopSlug}` match.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    spec: { type: 'string', default: 'docs/openapi.yaml' },
    routes: { type: 'string' },
  },
})

const METHODS = ['get', 'put', 'post', 'delete', 'patch']

function topLevelList(lines, key) {
  const start = lines.indexOf(`${key}:`)
  if (start === -1) return []
  const items = []
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const item = /^ {2}- ([A-Za-z]\w*)/.exec(line)
    if (item) items.push(item[1])
  }
  return items
}

function specOperations(lines) {
  const start = lines.indexOf('paths:')
  const operations = []
  let path = null
  let current = null
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break
    const pathKey = /^ {2}(\/\S*):\s*$/.exec(line)
    if (pathKey) {
      path = pathKey[1]
      current = null
      continue
    }
    const method = /^ {4}([a-z]+):\s*$/.exec(line)
    if (method && METHODS.includes(method[1])) {
      current = { method: method[1].toUpperCase(), path, operationId: null }
      operations.push(current)
      continue
    }
    const operationId = /^ {6}operationId:\s*(\w+)/.exec(line)
    if (operationId && current) current.operationId = operationId[1]
  }
  return operations
}

// `/a/:id/b` and `/a/{id}/b` both become `/a/{}/b`.
const shape = (pattern) => pattern.replace(/:[A-Za-z_]\w*\??|\{[^}]+\}/g, '{}').replace(/\/$/, '')

const lines = readFileSync(args.spec, 'utf8').split('\n')
const operations = specOperations(lines)
const foundation = new Set(topLevelList(lines, 'x-foundation-scope'))
const pending = new Set(topLevelList(lines, 'x-pending-operations'))

const routeJson = args.routes
  ? readFileSync(args.routes, 'utf8')
  : execFileSync('node', ['ace', 'list:routes', '--json'], { encoding: 'utf8' })
const routes = JSON.parse(routeJson)
  .flatMap((domain) => domain.routes)
  .filter((route) => route.pattern.startsWith('/api/v1/') || route.pattern === '/api/v1')
  .flatMap((route) =>
    route.methods
      .filter((method) => method !== 'HEAD')
      .map((method) => ({ method, pattern: route.pattern, name: route.name ?? null }))
  )

const problems = []
const built = new Set()
for (const route of routes) {
  const operation = operations.find(
    (candidate) =>
      candidate.method === route.method && shape(candidate.path) === shape(route.pattern)
  )
  if (!operation) {
    problems.push(`${route.method} ${route.pattern}: no operation in ${args.spec} paths`)
    continue
  }
  built.add(operation)
  if (route.name !== operation.operationId) {
    problems.push(
      `${route.method} ${route.pattern}: the route name is ${route.name ?? 'unset'}, the operationId is ${operation.operationId}`
    )
  }
}
for (const operation of operations) {
  if (operation.operationId && pending.has(operation.operationId)) {
    problems.push(
      `${operation.operationId} is in x-pending-operations but has a path (${operation.method} ${operation.path}); move it out of the pending list`
    )
  }
}
const unbuilt = operations.filter(
  (operation) => operation.path.startsWith('/api/v1/') && !built.has(operation)
)
for (const operation of unbuilt) {
  if (!foundation.has(operation.operationId)) {
    problems.push(
      `${operation.operationId ?? `${operation.method} ${operation.path}`}: an operation in paths has no route`
    )
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
const notBuilt = unbuilt.map((operation) => operation.operationId).join(', ')
process.stdout.write(
  `${routes.length} /api/v1 route(s) match their operations; specified, not built yet: ${notBuilt || 'none'}\n`
)
