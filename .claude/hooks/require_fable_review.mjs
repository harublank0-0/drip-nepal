#!/usr/bin/env node
/*
 * Claude Code PreToolUse hook (.claude/settings.json): a pull request is
 * opened only after a Fable-model code review has been recorded for the
 * commit it proposes (docs/09 §11.5). It runs before the GitHub tool
 * `create_pull_request` and before Bash commands that run `gh pr create`.
 *
 * Reviews are recorded with record_fable_review.mjs under the clone's git
 * directory (`<git common dir>/fable-reviews/<commit>.md`), so they are
 * never committed. A commit added after the review has no record. When
 * the local branch and `origin/<branch>` differ, both need a record, so a
 * `git push && gh pr create` can't slip an unreviewed commit through.
 *
 * Exit 0 lets the call through; exit 2 blocks it and tells Claude why.
 */
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

const cwd = process.env.CLAUDE_PROJECT_DIR || process.cwd()

function git(...args) {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function block(message) {
  process.stderr.write(`${message}\n`)
  process.exit(2)
}

async function readInput() {
  let text = ''
  for await (const chunk of process.stdin) text += chunk
  return JSON.parse(text || '{}')
}

/*
 * The words of each simple command in a shell line, split on unquoted
 * `;`, `&`, `|`, parentheses and newlines. Quotes group words, so text in
 * a title or body is never read as a flag.
 */
function shellCommands(line) {
  const commands = []
  let words = []
  let word = ''
  let inWord = false
  let quote = null
  const endWord = () => {
    if (inWord) words.push(word)
    word = ''
    inWord = false
  }
  const endCommand = () => {
    endWord()
    if (words.length > 0) commands.push(words)
    words = []
  }
  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (quote) {
      if (char === quote) quote = null
      else if (char === '\\' && quote === '"' && index + 1 < line.length) word += line[++index]
      else word += char
    } else if (char === "'" || char === '"') {
      quote = char
      inWord = true
    } else if (char === '\\' && index + 1 < line.length) {
      word += line[++index]
      inWord = true
    } else if (';&|()\n'.includes(char)) {
      endCommand()
    } else if (/\s/.test(char)) {
      endWord()
    } else {
      word += char
      inWord = true
    }
  }
  endCommand()
  return commands
}

/*
 * For a Bash call: the arguments after `gh pr create`, or null when the
 * command doesn't open a pull request. The settings `if` filter is only a
 * first pass: it also matches shell it can't parse, such as a `for` loop.
 */
function ghPrCreateArgs(command) {
  for (const words of shellCommands(command)) {
    let start = 0
    while (start < words.length && /^[A-Za-z_]\w*=/.test(words[start])) start++
    if (words[start] === 'env' || words[start] === 'command') start++
    if (!/(^|\/)gh$/.test(words[start] ?? '')) continue
    const pr = words.indexOf('pr', start + 1)
    if (pr !== -1 && words[pr + 1] === 'create') return words.slice(pr + 2)
  }
  return null
}

function headFromArgs(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (arg === '--head' || arg === '-H') return args[index + 1]
    if (arg.startsWith('--head=')) return arg.slice('--head='.length)
    if (arg.startsWith('-H') && arg.length > 2) return arg.slice(2)
  }
  return undefined
}

function resolveCommit(ref) {
  try {
    return git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`)
  } catch {
    return null
  }
}

async function main() {
  let input
  try {
    input = await readInput()
  } catch {
    block('The pull request check could not read its input. Open the pull request again.')
  }

  let named
  if (input.tool_name === 'Bash') {
    const args = ghPrCreateArgs(String(input.tool_input?.command ?? ''))
    if (args === null) process.exit(0)
    named = headFromArgs(args)
  } else {
    named = input.tool_input?.head
  }

  // Without a head, gh proposes the current branch. "owner:branch" names
  // the branch of a fork; the local branch has the same name.
  let branch = named ? String(named) : git('rev-parse', '--abbrev-ref', 'HEAD')
  if (branch.includes(':')) branch = branch.slice(branch.indexOf(':') + 1)

  const refs = branch === 'HEAD' ? ['HEAD'] : [branch, `origin/${branch}`]
  const commits = refs
    .map((ref) => ({ ref, commit: resolveCommit(ref) }))
    .filter((entry) => entry.commit)
  if (commits.length === 0) {
    block(
      `The pull request check could not find the branch "${branch}" in this clone. ` +
        'Fetch or check out the branch, then open the pull request again.'
    )
  }

  const records = join(resolve(cwd, git('rev-parse', '--git-common-dir')), 'fable-reviews')
  const missing = commits.filter(({ commit }) => !existsSync(join(records, `${commit}.md`)))
  if (missing.length === 0) process.exit(0)

  const distinct = new Set(commits.map(({ commit }) => commit))
  const where = commits.map(({ ref, commit }) => `${ref} is ${commit.slice(0, 7)}`).join(', ')
  const unreviewed = [...new Set(missing.map(({ commit }) => commit.slice(0, 7)))].join(' and ')
  block(
    [
      `No Fable code review is recorded for ${unreviewed}, which this pull request for "${branch}" would propose (${where}).`,
      ...(distinct.size > 1
        ? [
            'The local branch and the pushed branch differ: push (or fetch) first so they match, then make sure the final commit is reviewed.',
          ]
        : []),
      'This repository opens a pull request only after a Fable review of its final commit (docs/09 §11.5):',
      `1. Review the change with a Fable-model reviewer (an agent with model "fable") on \`git diff origin/main...${branch}\` (use the pull request's base branch if it is not main). Give it the diff and the files it touches, not your own conclusions, and ask for verified findings with file, line and a concrete failure.`,
      '2. Check each finding against the code. Fix the real ones and commit. If you commit after the review, review those commits too, so the record is for the final commit.',
      '3. Record it: node .claude/hooks/record_fable_review.mjs --model <the Fable model id> --report <a file with the findings and what you did about each>',
      '4. Open the pull request again, with the findings and their outcome in its description.',
    ].join('\n')
  )
}

main().catch((error) => {
  block(
    `The pull request check failed (${error?.message ?? error}). ` +
      'Run it from inside the repository, or check .claude/hooks/require_fable_review.mjs.'
  )
})
