// T-SEC-026, the repository half of the dependency gates (docs/07 TM-26,
// docs/09 §10.2). `pnpm audit --prod --audit-level high` is the advisory
// half; CI runs both. Node built-ins only.
//
//   node scripts/check_dependency_policy.mjs [--root <dir>] [--base <git ref>] [--labels <a,b>]
//
// Fails:
// 1. on a `tarball:` resolution in pnpm-lock.yaml outside https://registry.npmjs.org/,
//    and on any git (`type: git`, `repo:`, `commit:`) or local folder
//    (`type: directory`, `directory:`) resolution;
// 2. on a components.json registry other than `@shadcnuikit` at
//    https://shadcnuikit.com/r/{name}.json, which is allowed only once VX-13
//    clears (SHADCNUIKIT_ALLOWED below), and whose headers, if any, hold
//    `${SHADCNUIKIT_API_KEY}` and never a literal value (ADR-0015);
// 3. with --base (a pull request): when pnpm-lock.yaml changed since the
//    merge base but neither package.json nor pnpm-workspace.yaml did, unless
//    --labels holds `dependencies`, the label of the update bot's pull
//    requests that only maintainers can set.
// `--root` points it at a fixture tree (tests/unit/scripts/check_dependency_policy.spec.ts).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({
  options: {
    root: { type: 'string', default: '.' },
    base: { type: 'string' },
    labels: { type: 'string', default: '' },
  },
})
const root = resolve(args.root)

// VX-13 (risks register): the Shadcn UI Kit licence clarification. Set to
// true in the pull request that records VX-13 as cleared.
const SHADCNUIKIT_ALLOWED = false
const SHADCNUIKIT_URL = 'https://shadcnuikit.com/r/{name}.json'
const REGISTRY = 'https://registry.npmjs.org/'
const EXEMPTION_LABEL = 'dependencies'

const problems = []

// 1. Tarball resolutions.
const lockfile = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')
lockfile.split('\n').forEach((line, index) => {
  for (const match of line.matchAll(/tarball:\s*['"]?([^'",}\s]+)/g)) {
    if (!match[1].startsWith(REGISTRY)) {
      problems.push(`pnpm-lock.yaml:${index + 1}: tarball ${match[1]} is not on ${REGISTRY}`)
    }
  }
  // A git or local-folder resolution bypasses the registry and its integrity hash.
  if (
    /^\s*resolution:/.test(line) &&
    /\b(type:\s*['"]?(git|directory)\b|repo:|directory:|commit:)/.test(line)
  ) {
    problems.push(
      `pnpm-lock.yaml:${index + 1}: a git or directory resolution is not allowed (${line.trim()})`
    )
  }
})

// 2. components.json registries.
const componentsFile = join(root, 'components.json')
if (existsSync(componentsFile)) {
  const registries = JSON.parse(readFileSync(componentsFile, 'utf8')).registries ?? {}
  for (const [name, value] of Object.entries(registries)) {
    const url = typeof value === 'string' ? value : value?.url
    const headers = typeof value === 'string' ? {} : (value?.headers ?? {})
    if (name !== '@shadcnuikit' || url !== SHADCNUIKIT_URL) {
      problems.push(
        `components.json: registry ${name} (${url}) is not allowed; only @shadcnuikit at ${SHADCNUIKIT_URL} (ADR-0015)`
      )
      continue
    }
    if (!SHADCNUIKIT_ALLOWED) {
      problems.push(
        'components.json: the @shadcnuikit registry is allowed only once VX-13 clears (ADR-0015)'
      )
    }
    for (const [header, headerValue] of Object.entries(headers)) {
      if (!String(headerValue).includes('${SHADCNUIKIT_API_KEY}')) {
        problems.push(
          `components.json: header ${header} of @shadcnuikit must use \${SHADCNUIKIT_API_KEY}, never a literal value`
        )
      }
    }
  }
}

// 3. Lockfile-only changes in a pull request.
if (args.base) {
  const changed = execFileSync('git', ['diff', '--name-only', `${args.base}...HEAD`], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const labels = args.labels.split(',').map((label) => label.trim())
  if (
    changed.includes('pnpm-lock.yaml') &&
    !changed.includes('package.json') &&
    !changed.includes('pnpm-workspace.yaml') &&
    !labels.includes(EXEMPTION_LABEL)
  ) {
    problems.push(
      `pnpm-lock.yaml changed without package.json or pnpm-workspace.yaml; only a pull request labelled "${EXEMPTION_LABEL}" may do that (docs/09 §10.2)`
    )
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(
  `Lockfile tarballs come from ${REGISTRY}; components.json registries follow ADR-0015${args.base ? '; the lockfile change rule holds' : ''}\n`
)
