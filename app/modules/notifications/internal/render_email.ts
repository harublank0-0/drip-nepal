import { readFileSync } from 'node:fs'
import app from '@adonisjs/core/services/app'
import edge from 'edge.js'
import { createTranslator, type Catalog, type Translate } from '#shared/i18n/translator'
import type { EmailTemplate } from '#modules/notifications/domain/email_templates'

/*
 * Renders one email's subject, HTML part and plain-text part (docs/09
 * §11.2, docs/07 TM-11). The words come from the `emails` catalog in
 * resources/lang/en through the shared `createTranslator` (docs/08 §11.8,
 * docs/09 §13.10), read from disk once per process; the build copies
 * resources/lang (adonisrc.ts `metaFiles`). The templates get the catalog
 * as `t` and the email's values.
 *
 * - The HTML template prints everything with `{{ }}`, which Edge escapes.
 * - The plain-text template is its own text-only template and prints the
 *   raw values with the triple braces: `text/plain` has no markup context,
 *   and Edge's escaping would turn "didn't" into "didn&#x27;t". It is never
 *   made by stripping the HTML part. scripts/check_email_templates.mjs
 *   allows the triple braces only there and in the layouts (T-SEC-014).
 *
 * Values are strings and numbers: links built from `APP_URL` and counts.
 */

export type EmailValues = Record<string, string | number>
export type RenderedEmail = { subject: string; html: string; text: string }

let translate: Translate<`emails.${string}`> | null = null

function emailText() {
  translate ??= createTranslator({
    emails: JSON.parse(readFileSync(app.languageFilesPath('en', 'emails.json'), 'utf8')) as Catalog,
  })
  return translate
}

// `identity.password_reset` → `emails/identity/password_reset.html`
const view = (template: EmailTemplate, part: 'html' | 'text') =>
  `emails/${template.replaceAll('.', '/')}.${part}`

// Trailing spaces and the extra blank lines Edge leaves where a tag stood.
function tidy(text: string) {
  const lines = text.split('\n').map((line) => line.trimEnd())
  return `${lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`
}

export async function renderEmail(
  template: EmailTemplate,
  values: EmailValues
): Promise<RenderedEmail> {
  const t = emailText()
  const state = { ...values, t }
  const [html, text] = await Promise.all([
    edge.render(view(template, 'html'), state),
    edge.render(view(template, 'text'), state),
  ])
  return { subject: t(`emails.${template}.subject`), html, text: tidy(text) }
}
