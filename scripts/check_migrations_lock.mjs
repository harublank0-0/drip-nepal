// T-ARCH-017: applied migrations are never edited (docs/09 §8.4, §8.2;
// ADR-0011). Node built-ins only, so CI runs it before `pnpm install`.
//
//   node scripts/check_migrations_lock.mjs           check
//   node scripts/check_migrations_lock.mjs --write   append the lines of new files
//
// `--dir` and `--lock` point it at another folder and lock file (the script
// test, tests/unit/scripts/check_migrations_lock.spec.ts).
//
// `database/migrations.lock` holds one line per applied file, in timestamp
// order: `<sha256 of the file bytes>  <file name>`. The release that first
// deploys production creates it with --write (docs/09 §8.4). Until then the
// file does not exist and the script runs in file-name mode: it checks the
// docs/09 §8.2 rules of every file (name and first statement) and no
// checksum, so the baseline can still be re-squashed (docs/09 §8.1 item 4).
// Once the lock exists, it also fails when a locked file is edited, renamed or
// deleted, when a new file is older than the newest locked one, and when a
// file has no lock line.
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

// Positional arguments are ignored: lint-staged appends the staged file names
// (package.json `lint-staged`), and the script always checks the whole folder.
const { values: args } = parseArgs({
  allowPositionals: true,
  options: {
    write: { type: 'boolean', default: false },
    dir: { type: 'string', default: 'database/migrations' },
    lock: { type: 'string', default: 'database/migrations.lock' },
  },
})

// docs/09 §8.2, "File name"
const NAME = /^\d{13}_(baseline|create|add|alter|drop|validate|index|grant)_[a-z0-9_]+\.ts$/
const LOCK_TIMEOUT = "SET LOCAL lock_timeout = '5s'"
const DROP_INDEX = 'DROP INDEX CONCURRENTLY IF EXISTS '

const sha256 = (name) =>
  createHash('sha256')
    .update(readFileSync(join(args.dir, name)))
    .digest('hex')

/*
 * docs/09 §8.2, "Timeouts": the first statement of `up()` is
 * `SET LOCAL lock_timeout = '5s'`; in a file with `disableTransactions`, the
 * one kind that builds an index concurrently, it is
 * `DROP INDEX CONCURRENTLY IF EXISTS <name>`. Statements are
 * `this.schema.raw(String.raw`…`)` calls (docs/09 §8.6).
 */
function firstStatementError(name) {
  const source = readFileSync(join(args.dir, name), 'utf8')
  const up = /\basync\s+up\s*\(/.exec(source)
  if (!up) return `${name}: no up() method`
  const call = /this\.schema\.(\w+)\(\s*(?:String\.raw`([^`]*)`)?/.exec(source.slice(up.index))
  if (!call) return `${name}: up() runs no statement`
  const sql = call[1] === 'raw' && call[2] !== undefined ? call[2].trim() : null
  const concurrent = /static\s+disableTransactions\s*=\s*true/.test(source)
  if (concurrent) {
    return sql?.startsWith(DROP_INDEX)
      ? null
      : `${name}: a disableTransactions file starts with ${DROP_INDEX}<name> (09 §8.2)`
  }
  return sql === LOCK_TIMEOUT
    ? null
    : `${name}: the first statement must be ${LOCK_TIMEOUT} (09 §8.2)`
}

const files = readdirSync(args.dir)
  .filter((file) => file.endsWith('.ts'))
  .sort()
const lockExists = existsSync(args.lock)
const locked = lockExists
  ? readFileSync(args.lock, 'utf8')
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => line.trim().split(/\s+/))
  : []
const lockedNames = new Set(locked.map(([, name]) => name))
const errors = []

for (const [hash, name] of locked) {
  if (!files.includes(name)) errors.push(`${name}: locked migration deleted or renamed`)
  else if (sha256(name) !== hash) {
    errors.push(`${name}: applied migration changed; write a new migration instead`)
  }
}

const newest = locked.at(-1)?.[1] ?? ''
const added = files.filter((file) => !lockedNames.has(file))
for (const name of added) {
  if (!NAME.test(name)) errors.push(`${name}: file name does not follow 09 §8.2`)
  if (name < newest) errors.push(`${name}: older than ${newest}; regenerate after rebasing`)
  const statement = firstStatementError(name)
  if (statement) errors.push(statement)
  if (lockExists && !args.write) errors.push(`${name}: add its line to ${args.lock} (--write)`)
}

if (errors.length > 0) {
  process.stderr.write(errors.join('\n') + '\n')
  process.exit(1)
}

if (args.write && added.length > 0) {
  const lines = added.map((name) => `${sha256(name)}  ${name}\n`).join('')
  writeFileSync(args.lock, (lockExists ? readFileSync(args.lock, 'utf8') : '') + lines)
  process.stdout.write(`${args.lock}: ${added.length} line(s) added\n`)
} else {
  const mode = lockExists ? 'checksum' : 'file-name'
  process.stdout.write(`${files.length} migration file(s) pass (${mode} mode)\n`)
}
