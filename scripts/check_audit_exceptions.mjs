// T-SEC-038: the advisory exceptions agree and none has expired (docs/09
// §10.3, docs/07 §7.1). Node built-ins only.
//
//   node scripts/check_audit_exceptions.mjs [--workspace <file>] [--exceptions <file>] [--today YYYY-MM-DD]
//
// pnpm 11 reads the ignored advisories from `auditConfig.ignoreGhsas` in
// pnpm-workspace.yaml and has no expiry field, so security/audit-exceptions.md
// holds one table row per ignored GHSA: ID, package, reason, who accepted it
// and the expiry date. The check fails when an ID is in one file only, when
// a row lacks a reason or an acceptor, when its date is not a real
// YYYY-MM-DD date, or when the date is before today (UTC). The options point
// it at fixtures (tests/unit/scripts/check_audit_exceptions.spec.ts).
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    workspace: { type: 'string', default: 'pnpm-workspace.yaml' },
    exceptions: { type: 'string', default: 'security/audit-exceptions.md' },
    today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
  },
})

const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/

// The `ignoreGhsas` list under the top-level `auditConfig` key, in block or
// flow style. pnpm-workspace.yaml is Prettier-formatted YAML.
function ignoredGhsas(yaml) {
  const lines = yaml.split('\n')
  const config = lines.findIndex((line) => /^auditConfig:\s*(#.*)?$/.test(line))
  if (config === -1) return []
  const ids = []
  for (let index = config + 1; index < lines.length; index++) {
    const line = lines[index]
    if (/^\S/.test(line)) break // the next top-level key
    const flow = /^\s+ignoreGhsas:\s*\[(.*)\]/.exec(line)
    if (flow) {
      ids.push(
        ...flow[1]
          .split(',')
          .map((id) => id.trim().replace(/^['"]|['"]$/g, ''))
          .filter(Boolean)
      )
      continue
    }
    if (!/^\s+ignoreGhsas:\s*(#.*)?$/.test(line)) continue
    const indent = /^\s+/.exec(line)[0].length
    for (index++; index < lines.length; index++) {
      const item = /^(\s+)-\s*['"]?([^'"\s#]+)['"]?/.exec(lines[index])
      if (!item || item[1].length < indent) break
      ids.push(item[2])
    }
    index--
  }
  return ids
}

function exceptionRows(markdown) {
  return markdown
    .split('\n')
    .filter((line) => /^\|\s*GHSA-/.test(line))
    .map((line) => {
      const [id, pkg, reason, acceptedBy, expires] = line
        .slice(1, line.lastIndexOf('|'))
        .split('|')
        .map((cell) => cell.trim().replace(/^`|`$/g, ''))
      return { id, pkg, reason, acceptedBy, expires }
    })
}

const isDate = (text) =>
  /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text)

const ignored = ignoredGhsas(readFileSync(args.workspace, 'utf8'))
const rows = exceptionRows(readFileSync(args.exceptions, 'utf8'))
const problems = []

for (const id of ignored) {
  if (!GHSA.test(id)) problems.push(`${args.workspace}: "${id}" is not a GHSA ID`)
  if (!rows.some((row) => row.id === id)) {
    problems.push(`${id} is ignored in ${args.workspace} but has no row in ${args.exceptions}`)
  }
}
for (const row of rows) {
  if (!ignored.includes(row.id)) {
    problems.push(`${row.id} has a row in ${args.exceptions} but is not in auditConfig.ignoreGhsas`)
  }
  if (!row.pkg || !row.reason || !row.acceptedBy) {
    problems.push(`${row.id}: the row needs a package, a reason and who accepted it`)
  }
  if (!isDate(row.expires ?? '')) {
    problems.push(`${row.id}: the expiry "${row.expires ?? ''}" is not a YYYY-MM-DD date`)
  } else if (row.expires < args.today) {
    problems.push(`${row.id}: the exception expired on ${row.expires}`)
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${ignored.length} advisory exception(s), each with a current row\n`)
