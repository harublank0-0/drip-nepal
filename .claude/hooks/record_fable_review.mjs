#!/usr/bin/env node
/*
 * Records that a Fable-model code review covered a commit, so the
 * pull request check (require_fable_review.mjs) lets a pull request for
 * that commit be opened (docs/09 §11.5).
 *
 *   node .claude/hooks/record_fable_review.mjs --model claude-fable-5-1 --report review.md [--commit <ref>]
 *
 * The report is copied to `<git common dir>/fable-reviews/<commit>.md`,
 * inside the clone's git directory, so it is never committed.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function fail(message) {
  process.stderr.write(`${message}\n`)
  process.exit(1)
}

const options = {}
const args = process.argv.slice(2)
for (let index = 0; index < args.length; index += 2) {
  const name = args[index]
  if (!name?.startsWith('--') || args[index + 1] === undefined) {
    fail('Usage: record_fable_review.mjs --model <Fable model id> --report <file> [--commit <ref>]')
  }
  options[name.slice(2)] = args[index + 1]
}

if (!/fable/i.test(options.model ?? '')) {
  fail(`--model must name the Fable model that reviewed the change (got "${options.model ?? ''}").`)
}

let report = ''
try {
  report = readFileSync(options.report ?? '', 'utf8').trim()
} catch {
  fail(`Cannot read the review report "${options.report ?? ''}".`)
}
if (!report) fail('The review report is empty.')

let commit = ''
try {
  commit = git('rev-parse', '--verify', `${options.commit ?? 'HEAD'}^{commit}`)
} catch {
  fail(`Unknown commit "${options.commit ?? 'HEAD'}".`)
}

const folder = join(resolve(git('rev-parse', '--git-common-dir')), 'fable-reviews')
mkdirSync(folder, { recursive: true })
const file = join(folder, `${commit}.md`)
writeFileSync(
  file,
  [
    `commit: ${commit}`,
    `model: ${options.model}`,
    `recorded: ${new Date().toISOString()}`,
    '',
    report,
    '',
  ].join('\n')
)
process.stdout.write(`Recorded the Fable review of ${commit.slice(0, 7)} in ${file}\n`)
