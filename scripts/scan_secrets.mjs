// T-SEC-025, the secret-scan half (docs/07 TM-25 and §7.2): no secret in the
// repository's history. The scanner is secretlint with its recommended
// preset (.secretlintrc.json); the pre-commit hook runs the same rules on
// the staged files through lint-staged.
//
//   node scripts/scan_secrets.mjs [--root <dir>]
//
// Every blob reachable from any ref (`git rev-list --objects --all`) is
// scanned once, with the path it first had, so a secret that was committed
// and later deleted still fails. CI checks the repository out with its full
// history (fetch-depth 0); a shallow clone scans only what it has. Binary
// blobs and files listed in .secretlintignore are skipped. Findings are
// printed masked. `--root` points it at a fixture repository
// (tests/unit/scripts/scan_secrets.spec.ts).
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createEngine } from '@secretlint/node'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
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

const blobs = new Map()
for (const line of git('rev-list', '--objects', '--all').split('\n')) {
  const space = line.indexOf(' ')
  if (space === -1) continue
  const sha = line.slice(0, space)
  const path = line.slice(space + 1)
  if (!blobs.has(sha)) blobs.set(sha, path)
}

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
for await (const { sha, type, content } of readBlobs([...blobs.keys()])) {
  if (type !== 'blob') continue
  const path = blobs.get(sha)
  if (ignored.some((pattern) => pattern.test(path))) continue
  if (content.subarray(0, 8000).includes(0)) continue // binary
  scanned++
  const result = await engine.executeOnContent({ content: content.toString('utf8'), filePath: path })
  if (!result.ok) {
    const commit = git('log', '--all', '--format=%h', `--find-object=${sha}`).trim().split('\n').pop()
    findings.push(`${path} (blob ${sha.slice(0, 10)}, first in commit ${commit})\n${result.output}`)
  }
}

if (findings.length > 0) {
  process.stderr.write(
    `${findings.join('\n')}\n${findings.length} blob(s) in the history hold a secret. A live secret is a SEV-1 (docs/07 §7.2): rotate it first, then remove it.\n`
  )
  process.exit(1)
}
process.stdout.write(`${scanned} text blob(s) in the history hold no secret\n`)
