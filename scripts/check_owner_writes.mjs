// T-ARCH-001, the "writes only by the owning module" check (docs/09 §2.4,
// docs/05 §5.11): an import graph cannot see SQL, so this scans it. Node
// built-ins only.
//
//   node scripts/check_owner_writes.mjs [--root <dir>]
//
// 1. Every model file in app/models/ is the `model` of a table in
//    architecture/model-ownership.json, so rule 5 of .dependency-cruiser.cjs
//    knows its owner.
// 2. Every write to a table in a TypeScript file under app/ sits in
//    app/modules/<owner>/, where the owner is the table's module in the map;
//    a write to a table missing from the map fails too. A write is:
//    - raw SQL `INSERT INTO`, `UPDATE` or `DELETE FROM <table>`: in any case
//      inside the first argument of a raw helper (`rawQuery`, `raw`,
//      `knexRawQuery`), and in upper case anywhere else, so prose such as
//      "update users" in a message is not a write;
//    - the query builder: `.table('<table>')` and `.into('<table>')`, which
//      start an insert, and `.from('<table>')` followed in the same chain by
//      `.update(`, `.delete(`, `.del(`, `.increment(` or `.decrement(`.
//    Comments are skipped; `DO UPDATE`, `FOR UPDATE`, other schemas
//    (`pgboss.job`) and identifier bindings (`INSERT INTO ??`) are not
//    writes it reads. A table name held in a variable is not seen, and
//    model writes (`User.create`) are left to rule 5's import rules.
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

const SQL_WRITE =
  /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(?:ONLY\s+)?"?([a-z_][a-z0-9_]*)"?(?:\s*\.\s*"?([a-z_][a-z0-9_]*)"?)?/
const RAW_ARGUMENT =
  /\b(?:rawQuery|knexRawQuery|raw)\(\s*(?:String\.raw)?(`[^`]*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g
const BUILDER = /\.(table|into|from)\(\s*(['"`])([a-z_][a-z0-9_.]*)\2\s*\)/g
const CHAIN_WRITE = /\.(update|delete|del|increment|decrement)\(/

const problems = []
let writes = 0

// 1. Every model has an owner.
const models = new Set(
  Object.values(tables)
    .map((table) => table.model)
    .filter(Boolean)
)
for (const file of walk(join(root, 'app', 'models'))) {
  const path = relative(root, file).split(sep).join('/')
  if (!models.has(path)) {
    problems.push(
      `${path}: the model is not the \`model\` of any table in architecture/model-ownership.json`
    )
  }
}

// The method chain that continues a builder call: the rest of its line,
// then each following line that starts with `.`.
function chainAfter(source, index) {
  const lines = source.slice(index).split('\n')
  const chain = [lines[0]]
  for (const line of lines.slice(1)) {
    if (!/^\s*\./.test(line)) break
    chain.push(line)
  }
  return chain.join('\n')
}

function record(path, module, source, index, kind, qualified) {
  const [schema, name] = qualified.includes('.') ? qualified.split('.') : ['public', qualified]
  if (schema !== 'public') return // another schema, such as pgboss
  writes++
  const line = source.slice(0, index).split('\n').length
  const owner = tables[name]?.module
  if (!owner) {
    problems.push(
      `${path}:${line}: ${kind} ${name}: the table is not in architecture/model-ownership.json`
    )
  } else if (owner !== module) {
    problems.push(
      `${path}:${line}: ${kind} ${name}: ${name} belongs to ${owner}; only app/modules/${owner}/ writes it (docs/09 §2.1)`
    )
  }
}

function sqlWrites(path, module, source, text, offset, flags) {
  for (const match of text.matchAll(new RegExp(SQL_WRITE.source, flags))) {
    // `UPDATE` also appears in `ON CONFLICT … DO UPDATE SET` and `FOR UPDATE`.
    const before = text.slice(Math.max(0, match.index - 12), match.index)
    if (/\b(DO|FOR)\s+$/i.test(before)) continue
    const qualified = (match[3] ? `${match[2]}.${match[3]}` : match[2]).toLowerCase()
    const kind = match[1].replace(/\s+/g, ' ').toUpperCase()
    record(path, module, source, offset + match.index, kind, qualified)
  }
}

// 2. Every write in its owner's folder.
for (const file of walk(join(root, 'app'))) {
  const path = relative(root, file).split(sep).join('/')
  const module = /^app\/modules\/([^/]+)\//.exec(path)?.[1] ?? null
  const source = withoutComments(readFileSync(file, 'utf8'))

  // Raw helper arguments in any case; the rest in upper case only. Each raw
  // argument is blanked before the upper-case pass, so nothing counts twice.
  let rest = source
  for (const match of source.matchAll(RAW_ARGUMENT)) {
    const start = match.index + match[0].length - match[1].length
    sqlWrites(path, module, source, match[1], start, 'gi')
    rest = rest.slice(0, start) + ' '.repeat(match[1].length) + rest.slice(start + match[1].length)
  }
  sqlWrites(path, module, source, rest, 0, 'g')

  for (const match of source.matchAll(BUILDER)) {
    const [, method, , table] = match
    const chain = chainAfter(source, match.index + match[0].length)
    if (method === 'from' && !CHAIN_WRITE.test(chain)) continue
    record(path, module, source, match.index, `.${method}('${table}')`, table)
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(
  `${models.size} model(s) have an owner; ${writes} write(s) in app/, each in its table's owning module\n`
)
