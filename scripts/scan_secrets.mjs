// T-SEC-025, the secret-scan half (docs/07 TM-25 and §7.2): no secret in the
// repository's history. The scanner is secretlint with its recommended
// preset and a pattern for the secret variables of docs/09 §6.1
// (.secretlintrc.json).
//
//   node scripts/scan_secrets.mjs [--root <dir>]     the history of HEAD
//   node scripts/scan_secrets.mjs <file>...          these files (pre-commit)
//
// History mode scans every blob reachable from the checked-out commit
// (`git rev-list --objects HEAD`) once, with the path it first had, so a
// secret that was committed and later deleted still fails. Only HEAD's
// history is read, not every ref, so a stale remote branch cannot fail
// every pull request. CI checks the repository out with its full history
// (fetch-depth 0); a shallow clone scans only what it has. File mode is
// what lint-staged runs on the staged files. Both skip binary content and
// the paths of .secretlintignore, which the secretlint CLI does not apply to
// paths it is given. Findings are printed masked. `--root` points it at a
// fixture repository (tests/unit/scripts/scan_secrets.spec.ts).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { parseArgs } from 'node:util'
import { createEngine } from '@secretlint/node'

const { values: args, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { root: { type: 'string', default: '.' } },
})
const root = resolve(args.root)
const git = (...gitArgs) =>
  execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })

// Plain path globs (`*` within a segment, `**` across segments).
const ignoreFile = join(root, '.secretlintignore')
const ignored = (existsSync(ignoreFile) ? readFileSync(ignoreFile, 'utf8') : '')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line !== '' && !line.startsWith('#'))
  .map(
    (glob) =>
      new RegExp(
        `^${glob
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*\/?/g, '\u0000')
          .replace(/\*/g, '[^/]*')
          .replace(/\u0000/g, '.*')}$`
      )
  )

const isIgnored = (path) => ignored.some((pattern) => pattern.test(path))
const isBinary = (content) => content.subarray(0, 8000).includes(0)

// Object types and contents through one `git cat-file --batch` process.
async function* readBlobs(shas) {
  const child = spawn('git', ['cat-file', '--batch'], { cwd: root })
  let buffer = Buffer.alloc(0)
  let pending = null
  child.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk])
    pending?.()
  })
  const fill = () => new Promise((done) => (pending = done))
  for (const sha of shas) {
    child.stdin.write(`${sha}\n`)
    let newline
    while ((newline = buffer.indexOf(10)) === -1) await fill()
    const [, type, size] = buffer.subarray(0, newline).toString().split(' ')
    const length = Number(size)
    while (buffer.length < newline + 1 + length + 1) await fill()
    const content = buffer.subarray(newline + 1, newline + 1 + length)
    buffer = buffer.subarray(newline + 1 + length + 1)
    yield { sha, type, content }
  }
  child.stdin.end()
}

const engine = await createEngine({
  cwd: root,
  configFilePath: join(root, '.secretlintrc.json'),
  formatter: 'stylish',
  color: false,
  maskSecrets: true,
})

let scanned = 0
const findings = []

async function scan(content, path) {
  if (isIgnored(path) || isBinary(content)) return null
  scanned++
  const result = await engine.executeOnContent({
    content: content.toString('utf8'),
    filePath: path,
  })
  return result.ok ? null : result.output
}

if (files.length > 0) {
  for (const file of files) {
    // A symbolic link (such as a .claude/skills/ entry) or a folder holds no content to scan.
    if (!lstatSync(resolve(file)).isFile()) continue
    const path = relative(root, resolve(file)).split(sep).join('/')
    const output = await scan(readFileSync(resolve(file)), path)
    if (output) findings.push(`${path}\n${output}`)
  }
  if (findings.length > 0) {
    process.stderr.write(
      `${findings.join('\n')}\n${findings.length} file(s) hold a secret; remove it before committing.\n`
    )
    process.exit(1)
  }
  process.stdout.write(`${scanned} file(s) hold no secret\n`)
  process.exit(0)
}

const blobs = new Map()
for (const line of git('rev-list', '--objects', 'HEAD').split('\n')) {
  const space = line.indexOf(' ')
  if (space === -1) continue
  const sha = line.slice(0, space)
  const path = line.slice(space + 1)
  if (!blobs.has(sha)) blobs.set(sha, path)
}

for await (const { sha, type, content } of readBlobs([...blobs.keys()])) {
  if (type !== 'blob') continue
  const path = blobs.get(sha)
  const output = await scan(content, path)
  if (output) {
    const commit = git('log', '--format=%h', `--find-object=${sha}`, 'HEAD')
      .trim()
      .split('\n')
      .pop()
    findings.push(`${path} (blob ${sha.slice(0, 10)}, first in commit ${commit})\n${output}`)
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `${findings.join('\n')}\n${findings.length} blob(s) in the history hold a secret. A live secret is a SEV-1 (docs/07 §7.2): rotate it first, then remove it.\n`
  )
  process.exit(1)
}
process.stdout.write(`${scanned} text blob(s) in the history hold no secret\n`)
