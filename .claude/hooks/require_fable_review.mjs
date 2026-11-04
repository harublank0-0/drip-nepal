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

function runGit(directory, args) {
  return execFileSync('git', args, {
    cwd: directory,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

// Hooks run in the session's directory, which may be a linked worktree;
// the project directory is the fallback when that is not in a repository.
function repositoryDirectory() {
  for (const directory of [process.cwd(), process.env.CLAUDE_PROJECT_DIR]) {
    if (!directory) continue
    try {
      if (runGit(directory, ['rev-parse', '--is-inside-work-tree']) === 'true') return directory
    } catch {}
  }
  return process.cwd()
}

const cwd = repositoryDirectory()
const git = (...args) => runGit(cwd, args)

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
 * The index just past a heredoc started at `index` (pointing at `<<`):
 * its body runs to the line holding only the delimiter.
 */
function skipHeredoc(line, index) {
  let at = index + 2
  if (line[at] === '-') at++
  while (line[at] === ' ' || line[at] === '\t') at++
  const quote = line[at] === "'" || line[at] === '"' ? line[at] : null
  if (quote) at++
  let delimiter = ''
  while (at < line.length && (quote ? line[at] !== quote : /[^\s;&|()<>]/.test(line[at]))) {
    delimiter += line[at++]
  }
  if (quote) at++
  const bodyStart = line.indexOf('\n', at)
  if (!delimiter || bodyStart === -1) return at
  let lineStart = bodyStart + 1
  while (lineStart < line.length) {
    const lineEnd = line.indexOf('\n', lineStart)
    const text = line.slice(lineStart, lineEnd === -1 ? line.length : lineEnd)
    if (text.replace(/^\t+/, '') === delimiter) return lineEnd === -1 ? line.length : lineEnd
    if (lineEnd === -1) break
    lineStart = lineEnd + 1
  }
  return line.length
}

/*
 * The index of the `)` that closes the command substitution whose `(`
 * is at `index`, honouring quotes, nesting and heredocs inside it.
 */
function closingParen(line, index) {
  let depth = 0
  let quote = null
  for (let at = index; at < line.length; at++) {
    const char = line[at]
    if (quote === "'") {
      if (char === "'") quote = null
    } else if (quote === '"') {
      if (char === '\\') at++
      else if (char === '"') quote = null
    } else if (char === '\\') {
      at++
    } else if (char === "'" || char === '"') {
      quote = char
    } else if (char === '<' && line[at + 1] === '<' && line[at + 2] !== '<') {
      at = skipHeredoc(line, at) - 1
    } else if (char === '(') {
      depth++
    } else if (char === ')') {
      depth--
      if (depth === 0) return at
    }
  }
  return line.length - 1
}

/*
 * The words of each simple command in a shell line, split on unquoted
 * `;`, `&`, `|`, parentheses and newlines. Quotes group words, and a
 * `$(…)` or backtick substitution stays inside its word, so text in a
 * title or body is never read as a flag.
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
    if (quote === "'") {
      if (char === "'") quote = null
      else word += char
      continue
    }
    if (char === '\\' && line[index + 1] === '\n') {
      index++ // a line continuation
      continue
    }
    if (char === '$' && line[index + 1] === '(') {
      const end = closingParen(line, index + 1)
      word += line.slice(index, end + 1)
      inWord = true
      index = end
      continue
    }
    if (char === '`') {
      const end = line.indexOf('`', index + 1)
      const stop = end === -1 ? line.length - 1 : end
      word += line.slice(index, stop + 1)
      inWord = true
      index = stop
      continue
    }
    if (quote === '"') {
      if (char === '"') quote = null
      else if (char === '\\' && index + 1 < line.length) word += line[++index]
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
 * command doesn't open a pull request. `gh` may follow a launcher such as
 * `env`, `exec` or `xargs`, and `pr` may take `-R <repo>` before `create`.
 * The settings `if` filter is only a first pass: it also matches shell it
 * can't parse, such as a `for` loop.
 */
function ghPrCreateArgs(command) {
  for (const words of shellCommands(command)) {
    for (let gh = 0; gh < words.length; gh++) {
      if (!/(^|\/)gh$/.test(words[gh]) || words[gh + 1] !== 'pr') continue
      let at = gh + 2
      while (at < words.length) {
        if (words[at] === '-R' || words[at] === '--repo') at += 2
        else if (words[at].startsWith('--repo=') || /^-R./.test(words[at])) at++
        else break
      }
      if (words[at] === 'create') return words.slice(at + 1)
    }
  }
  return null
}

// Options of `gh pr create` that take a value, so their value is skipped.
const VALUE_OPTIONS = new Set([
  '-a',
  '--assignee',
  '-B',
  '--base',
  '-b',
  '--body',
  '-F',
  '--body-file',
  '-l',
  '--label',
  '-m',
  '--milestone',
  '-p',
  '--project',
  '-R',
  '--repo',
  '-r',
  '--reviewer',
  '-T',
  '--template',
  '-t',
  '--title',
  '--recover',
])

function headFromArgs(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (arg === '--') break
    if (arg === '--head' || arg === '-H') return args[index + 1]
    if (arg.startsWith('--head=')) return arg.slice('--head='.length)
    if (arg.startsWith('-H')) return arg.slice(2)
    if (VALUE_OPTIONS.has(arg)) index++
  }
  return undefined
}

const CURRENT_BRANCH =
  /^\$\(\s*git\s+(branch\s+--show-current|rev-parse\s+--abbrev-ref\s+HEAD)\s*\)$/

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

  if (named && CURRENT_BRANCH.test(named)) named = undefined
  if (named && /^[$`]/.test(named)) {
    block(
      `The pull request check can't read the branch "${named}". ` +
        'Pass the branch name to --head as plain text, or leave --head out to use the current branch.'
    )
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
