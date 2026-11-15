// T-ARCH-001, the "writes only by the owning module" check (docs/09 §2.4,
// docs/05 §5.11): an import graph cannot see SQL, so this scans it. Node
// built-ins only.
//
//   node scripts/check_owner_writes.mjs [--root <dir>]
//
// Every `INSERT INTO <table>`, `UPDATE <table>` and `DELETE FROM <table>` in
// a TypeScript file under app/ must sit in app/modules/<owner>/, where the
// owner is the table's module in architecture/model-ownership.json. A write
// to a table missing from the map fails too, so a new table joins the map.
// Keywords are matched in upper case, as the SQL in app/ is written, so
// prose such as "update users" in a message is not a write. Comments are
// skipped; an identifier binding (`INSERT INTO ??`) names no
// table and is not checked. Writes through the query builder or a model are
// covered by the import rules of .dependency-cruiser.cjs (rule 5), not here.
// `--root` points it at a fixture tree (tests/unit/scripts/check_owner_writes.spec.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
const root = resolve(args.root)
const { tables } = JSON.parse(
  readFileSync(join(root, 'architecture', 'model-ownership.json'), 'utf8')
)

function walk(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (/\.tsx?$/.test(entry.name)) files.push(path)
  }
  return files
}

// Blank out comments but keep strings, so SQL in template literals stays
// and line numbers stay right.
function withoutComments(source) {
  let out = ''
  let quote = null
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    const next = source[index + 1]
    if (quote) {
      out += char
      if (char === '\\') out += source[++index] ?? ''
      else if (char === quote) quote = null
    } else if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index++
      out += '\n'
    } else if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end === -1 ? source.length : end + 2
      out += source.slice(index, stop).replace(/[^\n]/g, ' ')
      index = stop - 1
    } else {
      if (char === "'" || char === '"' || char === '`') quote = char
      out += char
    }
  }
  return out
}

const WRITE =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?"?([a-z_][a-z0-9_]*)"?(?:\s*\.\s*"?([a-z_][a-z0-9_]*)"?)?/g
const problems = []
let writes = 0

for (const file of walk(join(root, 'app'))) {
  const path = relative(root, file).split(sep).join('/')
  const module = /^app\/modules\/([^/]+)\//.exec(path)?.[1] ?? null
  const source = withoutComments(readFileSync(file, 'utf8'))
  for (const match of source.matchAll(WRITE)) {
    // `UPDATE` also appears in `ON CONFLICT … DO UPDATE SET` and `FOR UPDATE`.
    const before = source.slice(Math.max(0, match.index - 12), match.index)
    if (/\b(DO|FOR)\s+$/.test(before)) continue
    const table = match[3] ?? match[2]
    if (match[3] && match[2] !== 'public') continue // another schema, such as pgboss
    writes++
    const line = source.slice(0, match.index).split('\n').length
    const owner = tables[table]?.module
    if (!owner) {
      problems.push(
        `${path}:${line}: ${match[1].replace(/\s+/g, ' ')} ${table}: the table is not in architecture/model-ownership.json`
      )
    } else if (owner !== module) {
      problems.push(
        `${path}:${line}: ${match[1].replace(/\s+/g, ' ')} ${table}: ${table} belongs to ${owner}; only app/modules/${owner}/ writes it (docs/09 §2.1)`
      )
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${writes} raw SQL write(s) in app/, each in its table's owning module\n`)
