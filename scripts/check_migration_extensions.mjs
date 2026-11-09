// T-ARCH-034: migration lint, no PostgreSQL extension outside the allow-list
// (ADR-0016 decision 2, docs/11 §1.9, docs/03 §5.3). Node built-ins only.
//
//   node scripts/check_migration_extensions.mjs
//   node scripts/check_migration_extensions.mjs --installed citext,plpgsql
//
// It reads every `CREATE EXTENSION` in the migration files. With
// `--installed`, it also checks the extension names a migrated database
// reports in `pg_extension` (the functional test passes them), so an
// extension created any other way fails too. `--dir` points it at another
// folder (the script test, tests/unit/scripts/).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

// ADR-0016 decision 2: core extensions only, which every PostgreSQL 18 ships.
const ALLOWED_EXTENSIONS = ['citext', 'pg_trgm', 'pgcrypto']
// initdb installs plpgsql in every database; no migration creates it.
const BUILT_IN = ['plpgsql']

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: 'database/migrations' },
    installed: { type: 'string' },
  },
})

// `CREATE EXTENSION [IF NOT EXISTS] name` or `"name"`, in any letter case.
const CREATE_EXTENSION = /\bcreate\s+extension\s+(?:if\s+not\s+exists\s+)?("[^"]+"|[\w-]+)/gi

const errors = []
let found = 0
for (const name of readdirSync(args.dir)
  .filter((file) => file.endsWith('.ts'))
  .sort()) {
  const source = readFileSync(join(args.dir, name), 'utf8')
  for (const match of source.matchAll(CREATE_EXTENSION)) {
    found += 1
    const extension = match[1].replaceAll('"', '')
    if (!ALLOWED_EXTENSIONS.includes(extension)) {
      errors.push(`${name}: extension ${extension} is not in the allow-list (ADR-0016)`)
    }
  }
}

if (args.installed !== undefined) {
  for (const extension of args.installed.split(',').filter(Boolean)) {
    if (!ALLOWED_EXTENSIONS.includes(extension) && !BUILT_IN.includes(extension)) {
      errors.push(`database: extension ${extension} is not in the allow-list (ADR-0016)`)
    }
  }
}

if (errors.length > 0) {
  process.stderr.write(errors.join('\n') + '\n')
  process.exit(1)
}
process.stdout.write(
  `${found} CREATE EXTENSION statement(s) use the allow-list: ${ALLOWED_EXTENSIONS.join(', ')}\n`
)
