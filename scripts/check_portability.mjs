// T-ARCH-030: nothing in the repository points outside it (AGENTS.md "Keep
// the repository self-contained", docs/10 §5.1). Node built-ins only.
//
//   node scripts/check_portability.mjs [--root <dir>] [--denylist <file>]
//
// Every tracked text file (`git ls-files`; a plain folder walk when --root
// is not a git work tree) is read line by line against the patterns of
// scripts/portability_denylist.txt: absolute home-directory paths, local
// file URLs and the names of local-only planning sources. The denylist
// itself is the one file that may spell them. `--root` and `--denylist`
// point it at a fixture tree (tests/unit/scripts/check_portability.spec.ts).
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    denylist: { type: 'string', default: 'scripts/portability_denylist.txt' },
  },
})
const root = resolve(args.root)
const denylistFile = resolve(args.denylist)

const patterns = readFileSync(denylistFile, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .map((line) => new RegExp(line))

function walk(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) walk(path, files)
    else if (entry.isFile()) files.push(path)
  }
  return files
}

function trackedFiles() {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (resolve(top) !== root) throw new Error('not the work tree root')
    return execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(Boolean)
      .map((name) => join(root, name))
  } catch {
    return walk(root)
  }
}

const problems = []
let scanned = 0
for (const file of trackedFiles()) {
  if (resolve(file) === denylistFile) continue
  let buffer
  try {
    buffer = readFileSync(file)
  } catch {
    continue // deleted in the work tree
  }
  if (buffer.subarray(0, 8000).includes(0)) continue // binary
  scanned++
  buffer
    .toString('utf8')
    .split('\n')
    .forEach((line, index) => {
      const pattern = patterns.find((candidate) => candidate.test(line))
      if (pattern) {
        problems.push(`${relative(root, file)}:${index + 1}: matches /${pattern.source}/`)
      }
    })
}

if (problems.length > 0) {
  process.stderr.write(
    `${problems.join('\n')}\nThese point outside the repository (AGENTS.md, T-ARCH-030). Link a file in the repository instead.\n`
  )
  process.exit(1)
}
process.stdout.write(`${scanned} tracked text file(s) point nowhere outside the repository\n`)
