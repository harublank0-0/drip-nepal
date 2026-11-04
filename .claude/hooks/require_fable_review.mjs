#!/usr/bin/env node
/*
 * Claude Code PreToolUse hook (.claude/settings.json): a pull request is
 * opened only after a Fable-model code review has been recorded for the
 * exact commit it proposes (docs/09 §11.5). It runs before the GitHub
 * tool `create_pull_request` and before `gh pr create`.
 *
 * Reviews are recorded with record_fable_review.mjs under the clone's git
 * directory (`<git common dir>/fable-reviews/<commit>.md`), so they are
 * never committed. A commit added after the review has no record, so the
 * review always covers the code being proposed.
 *
 * Exit 0 lets the call through; exit 2 blocks it and tells Claude why.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
}

function block(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

let input = {}
try {
  input = JSON.parse(readFileSync(0, 'utf8') || '{}')
} catch {
  block('The pull request check could not read its input. Open the pull request again.')
}

// The branch the pull request proposes: `head` for the GitHub tool,
// `--head`/`-H` for gh; without one, gh uses the current branch.
function proposedBranch() {
  const named =
    input.tool_name === 'Bash'
      ? /(?:--head|-H)[\s=]+["']?([^\s"']+)/.exec(input.tool_input?.command ?? '')?.[1]
      : input.tool_input?.head
  if (!named) return git('rev-parse', '--abbrev-ref', 'HEAD')
  // "owner:branch" names a branch of a fork; the local branch has the same name.
  return named.includes(':') ? named.slice(named.indexOf(':') + 1) : named
}

// GitHub opens the pull request from the pushed branch, so its commit
// counts; the local branch is the fallback before a fetch.
function commitOf(branch) {
  const candidates = branch === 'HEAD' ? ['HEAD'] : [`origin/${branch}`, branch]
  for (const candidate of candidates) {
    try {
      return git('rev-parse', '--verify', '--quiet', `${candidate}^{commit}`)
    } catch {}
  }
  return null
}

const ref = proposedBranch()
const commit = commitOf(ref)
if (!commit) {
  block(
    `The pull request check could not find the commit of "${ref}" in this clone. ` +
      'Fetch or check out the branch, then open the pull request again.'
  )
}

const record = join(resolve(git('rev-parse', '--git-common-dir')), 'fable-reviews', `${commit}.md`)
if (existsSync(record)) process.exit(0)

block(
  [
    `No Fable code review is recorded for ${commit.slice(0, 7)} ("${ref}"), the commit this pull request proposes.`,
    'This repository opens a pull request only after a Fable review of its final commit (docs/09 §11.5):',
    `1. Review the change with a Fable-model reviewer (an agent with model "fable") on \`git diff origin/main...${commit.slice(0, 7)}\` (use the pull request's base branch if it is not main). Give it the diff and the files it touches, not your own conclusions, and ask for verified findings with file, line and a concrete failure.`,
    '2. Check each finding against the code. Fix the real ones and commit. If you commit after the review, review those commits too, so the record is for the final commit.',
    '3. Record it: node .claude/hooks/record_fable_review.mjs --model <the Fable model id> --report <a file with the findings and what you did about each>',
    '4. Open the pull request again, with the findings and their outcome in its description.',
  ].join('\n')
)
