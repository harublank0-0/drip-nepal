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
// An HTML email template fails on Edge's two raw outputs anywhere in it,
// comments included: the triple-brace mustache and `html.safe(`, which marks
// a value safe so the escaping mustache prints it raw.
// `--root` points it at a fixture tree
// (tests/unit/scripts/check_email_templates.spec.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

const { values: args } = parseArgs({ options: { root: { type: 'string', default: '.' } } })
const root = resolve(args.root)
const EMAILS = 'resources/views/emails'
const LAYOUTS = `${EMAILS}/layouts/`
const RAW_OUTPUT = [
  { pattern: '{{{', name: 'a triple-brace mustache' },
  { pattern: 'html.safe(', name: 'html.safe()' },
]

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

const problems = []
const html = templates().filter((file) => !file.startsWith(LAYOUTS) && !file.endsWith('.text.edge'))
for (const file of html) {
  for (const [index, line] of readFileSync(join(root, file), 'utf8').split('\n').entries()) {
    for (const raw of RAW_OUTPUT) {
      if (line.includes(raw.pattern)) {
        problems.push(
          `${file}:${index + 1}: ${raw.name} prints raw output; use {{ }} (docs/09 §11.2)`
        )
      }
    }
  }
}

if (problems.length > 0) {
  process.stderr.write(`${problems.join('\n')}\n`)
  process.exit(1)
}
process.stdout.write(`${html.length} HTML email template(s) print every value escaped\n`)
