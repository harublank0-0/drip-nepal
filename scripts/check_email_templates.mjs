// T-SEC-014, the email-template grep (docs/09 §11.2, docs/07 TM-11): no HTML
// email template prints a value unescaped. Node built-ins only.
//
//   node scripts/check_email_templates.mjs [--root <dir>]
//
// Every `.edge` file under resources/views/emails/ is an HTML email
// template, except:
// - the reviewed static layout partials in resources/views/emails/layouts/,
//   which print their main slot raw;
// - the text-only templates, named `<name>.text.edge`, which print raw
//   values on purpose, because `text/plain` has no markup context.
// An HTML email template fails, anywhere in it, comments included, on
// Edge's ways to print raw output:
// - the triple-brace mustache;
// - `html.safe` and `html.attrs` (the `html` global's helpers, which mark a
//   value safe so the escaping mustache prints it raw), with or without a
//   call, and with spaces around the dot;
// - `toAttrs`, the component props' raw attribute string;
// and on an `@include`, `@includeIf` or `@component` (also `@!component`)
// whose target is not a literal path under `emails/`, or is a text-only
// template, whose raw output would land in the HTML part.
// With no `--root`, the check also fails when it finds no HTML template,
// so a moved folder cannot make it pass by checking nothing. `--root`
// points it at a fixture tree (tests/unit/scripts/check_email_templates.spec.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string' } } })
const root = resolve(args.root ?? '.')
const EMAILS = 'resources/views/emails'
const LAYOUTS = `${EMAILS}/layouts/`
const RAW_OUTPUT = [
  { pattern: /\{\{\{/g, name: 'a triple-brace mustache' },
  { pattern: /\bhtml\s*\.\s*(safe|attrs)\b/g, name: 'html.safe or html.attrs' },
  { pattern: /\btoAttrs\b/g, name: 'toAttrs' },
]
// A partial tag; its arguments follow, on the same line or the next ones.
const PARTIAL_TAG = /@!?(include|includeIf|component)\s*\(/g

function templates() {
  const directory = join(root, EMAILS)
  if (!existsSync(directory)) return []
  return readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.edge'))
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(root.length + 1)
        .split('\\')
        .join('/')
    )
    .sort()
}

// Why a partial's target is refused, or null when it is an HTML email partial.
// `@includeIf` names its template second, after the condition.
function badTarget(tag, args) {
  const literal = tag === 'includeIf' ? /^[^,]*,\s*(['"`])([^'"`]*)\1/ : /^\s*(['"`])([^'"`]*)\1/
  const match = literal.exec(args)
  if (!match) return 'a target that is not a literal path'
  const target = match[2].replace(/\.edge$/, '')
  if (target.includes('::') || !target.startsWith('emails/') || target.split('/').includes('..')) {
    return `"${match[2]}", outside emails/`
  }
  if (target.endsWith('.text')) return `"${match[2]}", a text-only template`
  return null
}

const problems = []
const html = templates().filter((file) => !file.startsWith(LAYOUTS) && !file.endsWith('.text.edge'))
for (const file of html) {
  const source = readFileSync(join(root, file), 'utf8')
  const where = (index) => `${file}:${source.slice(0, index).split('\n').length}`
  for (const raw of RAW_OUTPUT) {
    for (const match of source.matchAll(raw.pattern)) {
      problems.push(
        `${where(match.index)}: ${raw.name} prints raw output; use {{ }} (docs/09 §11.2)`
      )
    }
  }
  for (const match of source.matchAll(PARTIAL_TAG)) {
    const reason = badTarget(match[1], source.slice(match.index + match[0].length))
    if (reason) problems.push(`${where(match.index)}: @${match[1]} of ${reason} (docs/09 §11.2)`)
  }
}
if (args.root === undefined && html.length === 0) {
  problems.push(`no HTML email template found under ${EMAILS}/ (docs/09 §11.2)`)
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${html.length} HTML email template(s) print every value escaped\n`)
