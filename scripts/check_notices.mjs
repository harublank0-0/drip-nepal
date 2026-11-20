// T-UI-024: THIRD_PARTY_NOTICES.md lists exactly the copied component files
// (docs/08 §12.4). Node built-ins only.
//
//   node scripts/check_notices.mjs [--root <dir>]
//
// Every file under inertia/components/ui/ and inertia/components/kit/ needs
// one row in the notices file, whose first cell is the file's path in
// backticks, and every such row needs its file. In ui/, a file with a
// `dripnepal-change:` comment needs a row whose "Local changes" cell is not
// "None", and a row that lists local changes needs that comment in its file
// (08 §12.1). `--root` points it at a fixture tree
// (tests/unit/scripts/check_notices.spec.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
const root = resolve(args.root)
const NOTICES = 'THIRD_PARTY_NOTICES.md'
const FOLDERS = ['inertia/components/ui', 'inertia/components/kit']
const MARKER = 'dripnepal-change:'

function filesIn(folder) {
  const directory = join(root, folder)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .split('\\')
        .join('/')
    )
}

const problems = []
const noticesPath = join(root, NOTICES)
if (!existsSync(noticesPath)) {
  process.stderr.write(`${NOTICES} is missing (docs/08 §12.4)\n`)
  process.exit(1)
}

// Table rows whose first cell is a backticked path under one of the folders.
const rows = new Map()
let header
for (const [index, line] of readFileSync(noticesPath, 'utf8').split('\n').entries()) {
  if (!line.startsWith('|')) continue
  const cells = line
    .slice(1, line.endsWith('|') ? -1 : undefined)
    .split('|')
    .map((cell) => cell.trim())
  if (cells[0] === 'Path') header = cells
  const path = /^`([^`]+)`$/.exec(cells[0])?.[1]
  if (!path || !FOLDERS.some((folder) => path.startsWith(`${folder}/`))) continue
  if (rows.has(path)) problems.push(`${NOTICES}:${index + 1}: a second row for ${path}`)
  rows.set(path, { cells, line: index + 1 })
}
const localChanges = header?.indexOf('Local changes') ?? -1
if (localChanges === -1) problems.push(`${NOTICES}: no table header with a "Local changes" column`)

const files = FOLDERS.flatMap(filesIn)
for (const file of files) {
  const row = rows.get(file)
  if (!row) {
    problems.push(`${file}: no row in ${NOTICES}`)
    continue
  }
  if (!file.startsWith('inertia/components/ui/') || localChanges === -1) continue
  const marked = readFileSync(join(root, file), 'utf8').includes(MARKER)
  const listed = (row.cells[localChanges] ?? '') !== 'None'
  if (marked && !listed) {
    problems.push(`${NOTICES}:${row.line}: ${file} has a ${MARKER} comment, but its row says None`)
  }
  if (!marked && listed) {
    problems.push(
      `${NOTICES}:${row.line}: ${file} lists local changes, but has no ${MARKER} comment`
    )
  }
}
for (const [path, row] of rows) {
  if (!files.includes(path)) problems.push(`${NOTICES}:${row.line}: ${path} does not exist`)
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${files.length} copied component file(s) match the rows of ${NOTICES}\n`)
