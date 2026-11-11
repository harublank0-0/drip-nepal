// T-ARCH-033: every test ID that a test cites is registered in docs/10 §6
// (docs/10 §6.1). Node built-ins only.
//
//   node scripts/check_test_ids.mjs [--root <dir>]
//
// A citation is a `T-<AREA>-<NNN>` with one of the 21 areas of docs/00 §1.3,
// in a file under tests/, scripts/ or .github/workflows/ (the CI steps that
// run a check name its ID). The registry is the first column of the docs/10
// §6 tables. An ID cited but not registered fails; registered IDs that no
// test cites yet are listed, which is expected while features are unbuilt.
// `--root` points it at a fixture tree (tests/unit/scripts/check_test_ids.spec.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
const root = resolve(args.root)

const AREAS = [
  'ARCH', 'API', 'SEC', 'IAM', 'SHOP', 'CAT', 'MED', 'INV', 'CART', 'CHK', 'ORD',
  'FUL', 'PAY', 'RET', 'LED', 'NOT', 'ADM', 'OPS', 'UI', 'A11Y', 'PERF',
]
const ID = new RegExp(`\\bT-(?:${AREAS.join('|')})-\\d{3}\\b`, 'g')

const docs = readFileSync(join(root, 'docs', '10-testing-and-quality-gates.md'), 'utf8')
const start = docs.indexOf('\n## 6. Test ID registry')
const end = docs.indexOf('\n## 7. ', start)
if (start === -1 || end === -1) {
  process.stderr.write('docs/10 has no "## 6. Test ID registry" section followed by "## 7."\n')
  process.exit(1)
}
const registered = new Set(
  [...docs.slice(start, end).matchAll(/^\| `(T-[A-Z0-9]+-\d{3})` +\|/gm)].map((match) => match[1])
)

function walk(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

const cited = new Map()
for (const folder of ['tests', 'scripts', join('.github', 'workflows')]) {
  for (const file of walk(join(root, folder))) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      for (const [id] of line.matchAll(ID)) {
        if (!cited.has(id)) cited.set(id, `${relative(root, file)}:${index + 1}`)
      }
    })
  }
}

const unregistered = [...cited].filter(([id]) => !registered.has(id))
if (unregistered.length > 0) {
  process.stderr.write(
    `${unregistered.map(([id, where]) => `${where}: ${id} is not registered in docs/10 §6`).join('\n')}\n` +
      'Register a new ID in docs/10 §6 first (docs/10 §6.1).\n'
  )
  process.exit(1)
}
const uncited = [...registered].filter((id) => !cited.has(id)).sort()
process.stdout.write(
  `${cited.size} cited test ID(s) are registered; ${uncited.length} of ${registered.size} registered ID(s) are not cited by a test yet:\n${uncited.join(' ')}\n`
)
