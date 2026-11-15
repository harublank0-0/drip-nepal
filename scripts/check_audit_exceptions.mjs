// T-SEC-038: the advisory exceptions agree and none has expired (docs/09
// §10.3, docs/07 §7.1). Node built-ins only.
//
//   node scripts/check_audit_exceptions.mjs [--workspace <file>] [--exceptions <file>] [--today YYYY-MM-DD]
//
// pnpm 11 reads the ignored advisories from `auditConfig.ignoreGhsas` in
// pnpm-workspace.yaml and has no expiry field, so security/audit-exceptions.md
// holds one table row per ignored GHSA: ID, package, reason, who accepted it
// and the expiry date. The check fails when an ID is in one file only, when
// auditConfig holds a key other than ignoreGhsas, when a row lacks a
// package or a reason, when its acceptor is empty or starts with "Pending",
// when its date is not a real YYYY-MM-DD date, or when the date is before
// today (UTC). The options point
// it at fixtures (tests/unit/scripts/check_audit_exceptions.spec.ts).
import { readFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { parse } from 'yaml'

const { values: args } = parseArgs({
  options: {
    workspace: { type: 'string', default: 'pnpm-workspace.yaml' },
    exceptions: { type: 'string', default: 'security/audit-exceptions.md' },
    today: { type: 'string', default: new Date().toISOString().slice(0, 10) },
  },
})

const GHSA = /^GHSA(-[23456789cfghjmpqrvwx]{4}){3}$/

// `auditConfig.ignoreGhsas` of pnpm-workspace.yaml, read with a YAML parser
// (comments, flow style, quoting and anchors all count as pnpm reads them).
// Any other auditConfig key fails: pnpm 11 could read it as another way to
// silence advisories that this check does not see.
function ignoredGhsas(text, problems) {
  const workspace = parse(text) ?? {}
  const config = workspace.auditConfig
  if (config === undefined || config === null) return []
  if (typeof config !== 'object' || Array.isArray(config)) {
    problems.push(`${args.workspace}: auditConfig must be a mapping`)
    return []
  }
  for (const key of Object.keys(config)) {
    if (key !== 'ignoreGhsas') {
      problems.push(
        `${args.workspace}: auditConfig.${key} is not allowed; only ignoreGhsas, with a row each in ${args.exceptions}`
      )
    }
  }
  const ids = config.ignoreGhsas ?? []
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string')) {
    problems.push(`${args.workspace}: auditConfig.ignoreGhsas must be a list of GHSA IDs`)
    return []
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

const problems = []
const ignored = ignoredGhsas(readFileSync(args.workspace, 'utf8'), problems)
const rows = exceptionRows(readFileSync(args.exceptions, 'utf8'))

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
  if (!row.pkg || !row.reason) {
    problems.push(`${row.id}: the row needs a package and a reason`)
  }
  if (!row.acceptedBy || /^pending/i.test(row.acceptedBy)) {
    problems.push(
      `${row.id}: no one has accepted this exception yet ("${row.acceptedBy ?? ''}"); the tech lead accepts it by name and date, or the advisory is fixed`
    )
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
