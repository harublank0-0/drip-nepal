// T-ARCH-029: the docs check of ADR-0001 (Verification) and docs/10 §5.1,
// Repository stage. Node built-ins only.
//
//   node scripts/check_docs.mjs [--root <dir>]
//
// 1. Every relative Markdown link in the repository's own Markdown files
//    resolves: the file or folder exists and, for a `#fragment`, the target
//    file has a heading (GitHub's slug) or an `<a id>`/`<a name>` with it.
//    The files are the root *.md, docs/**, .github/** and the project
//    skills (.agents/skills/dripnepal-*/**); the vendored skills keep their
//    authors' text (skills-lock.json) and are not checked.
// 2. Every docs/adr/NNNN-*.md has the title `# ADR-NNNN: …`, the line
//    `Status: …` under it, and the eight `##` sections of ADR-0001 decision
//    2, in order.
// 3. No two ADRs share a number, and docs/adr/README.md links every ADR.
//
// `--root` points it at a fixture tree (tests/unit/scripts/check_docs.spec.ts).
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
const root = resolve(args.root)

const ADR_SECTIONS = [
  'Status',
  'Context',
  'Decision',
  'Alternatives considered',
  'Consequences',
  'When to revisit',
  'Verification',
  'Related',
]

function walk(directory, files = []) {
  if (!existsSync(directory)) return files
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.name.endsWith('.md')) files.push(path)
  }
  return files
}

function markdownFiles() {
  const files = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(root, entry.name))
  walk(join(root, 'docs'), files)
  walk(join(root, '.github'), files)
  const skills = join(root, '.agents', 'skills')
  if (existsSync(skills)) {
    for (const entry of readdirSync(skills, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('dripnepal-')) {
        walk(join(skills, entry.name), files)
      }
    }
  }
  return files.sort()
}

// Fenced code blocks hold examples, not links; their lines become empty so
// line numbers stay right.
function proseLines(text) {
  let fence = null
  return text.split('\n').map((line) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = null
      return ''
    }
    if (marker) {
      fence = marker[1]
      return ''
    }
    return line
  })
}

// GitHub's heading slug (github-slugger): lower case, punctuation and
// symbols dropped except `-` and `_`, each space a `-`; repeats get -1, -2.
function slug(heading) {
  const text = heading
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
  return text.replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-')
}

const anchorCache = new Map()
function anchorsOf(file) {
  if (anchorCache.has(file)) return anchorCache.get(file)
  const anchors = new Set()
  const seen = new Map()
  const text = readFileSync(file, 'utf8')
  for (const line of proseLines(text)) {
    const heading = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
    if (heading) {
      const base = slug(heading[1])
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      anchors.add(count === 0 ? base : `${base}-${count}`)
    }
    for (const match of line.matchAll(/<a\s+(?:id|name)="([^"]+)"/g)) anchors.add(match[1])
  }
  anchorCache.set(file, anchors)
  return anchors
}

const problems = []
const report = (file, line, message) =>
  problems.push(`${relative(root, file)}${line ? `:${line}` : ''}: ${message}`)

// 1. Links.
let links = 0
for (const file of markdownFiles()) {
  proseLines(readFileSync(file, 'utf8')).forEach((rawLine, index) => {
    const line = rawLine.replace(/`[^`]*`/g, (code) => ' '.repeat(code.length))
    for (const match of line.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)) {
      const target = match[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue // https:, mailto: and the like
      links++
      const [pathPart, fragment] = target.split('#')
      const path = decodeURIComponent(pathPart)
      const resolved = path === '' ? file : resolve(dirname(file), path)
      if (!resolved.startsWith(root)) {
        report(file, index + 1, `link "${target}" leaves the repository`)
        continue
      }
      if (!existsSync(resolved)) {
        report(file, index + 1, `link "${target}": ${relative(root, resolved)} does not exist`)
        continue
      }
      if (fragment === undefined || fragment === '') continue
      if (statSync(resolved).isDirectory() || !resolved.endsWith('.md')) continue
      if (!anchorsOf(resolved).has(decodeURIComponent(fragment))) {
        report(file, index + 1, `link "${target}": no heading #${fragment} in ${relative(root, resolved)}`)
      }
    }
  })
}

// 2 and 3. ADRs.
const adrFolder = join(root, 'docs', 'adr')
const adrs = existsSync(adrFolder)
  ? readdirSync(adrFolder).filter((name) => /^\d{4}-.+\.md$/.test(name))
  : []
const numbers = new Map()
for (const name of adrs) {
  const number = name.slice(0, 4)
  numbers.set(number, [...(numbers.get(number) ?? []), name])
  const file = join(adrFolder, name)
  const lines = readFileSync(file, 'utf8').split('\n')
  if (!new RegExp(`^# ADR-${number}: \\S`).test(lines[0])) {
    report(file, 1, `the title is not "# ADR-${number}: <title>"`)
  }
  if (!lines.slice(1, 4).some((line) => /^Status: \S/.test(line))) {
    report(file, 0, 'no "Status: …" line under the title')
  }
  const sections = proseLines(lines.join('\n'))
    .filter((line) => /^## /.test(line))
    .map((line) => line.slice(3).trim())
  if (sections.join('|') !== ADR_SECTIONS.join('|')) {
    report(
      file,
      0,
      `the ## sections are [${sections.join(', ')}]; ADR-0001 decision 2 requires [${ADR_SECTIONS.join(', ')}]`
    )
  }
}
for (const [number, names] of numbers) {
  if (names.length > 1) report(adrFolder, 0, `ADR number ${number} is used by ${names.join(', ')}`)
}
const indexFile = join(adrFolder, 'README.md')
if (adrs.length > 0) {
  const index = existsSync(indexFile) ? readFileSync(indexFile, 'utf8') : ''
  for (const name of adrs) {
    if (!index.includes(`](${name})`)) report(indexFile, 0, `the index does not link ${name}`)
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(
  `${links} relative link(s) resolve; ${adrs.length} ADR(s) have the ADR-0001 sections and are indexed\n`
)
