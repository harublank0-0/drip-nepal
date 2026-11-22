import { test } from '@japa/runner'
import { InvariantViolation } from '#exceptions/programming_errors'
import { EMAIL_TEMPLATES, type EmailTemplate } from '#modules/notifications/domain/email_templates'
import { renderEmail } from '#modules/notifications/internal/render_email'

/*
 * T-SEC-014, the email-template render case (docs/07 TM-11, docs/09 §11.2):
 * every template, rendered with a value that holds markup, escapes it in the
 * HTML part and prints it unchanged in the plain-text part, which is a
 * text-only template and not stripped HTML (AC-FR-NOT-001-3). Every word
 * comes from the `emails` catalog, so no key is left unrendered. The grep
 * half is tests/unit/scripts/check_email_templates.spec.ts.
 *
 * T-UI-034, the email case of the message catalogs (docs/08 §11.8): where
 * the UI renders a missing key, an email whose subject is missing from the
 * catalog throws, so no email goes out with `emails.<name>.subject` as its
 * subject.
 */

const MARKUP = `https://example.test/?a="><script>alert(1)</script>&b='1'`

test.group('T-SEC-014 email templates escape HTML and keep plain text raw', () => {
  test('T-SEC-014 {template} escapes a value in the HTML part and prints it raw in the text part')
    .with(EMAIL_TEMPLATES.map((template) => ({ template })))
    .run(async ({ assert }, { template }) => {
      const email = await renderEmail(template, { link: MARKUP, minutes: 60, hours: 24 })

      assert.notInclude(email.html, '<script>')
      assert.include(email.html, '&lt;script&gt;')

      assert.include(email.text, MARKUP)
      for (const entity of ['&lt;', '&gt;', '&quot;', '&#x27;', '&amp;']) {
        assert.notInclude(email.text, entity)
      }
      // Each email says "didn't"; Edge's escaping would print didn&#x27;t.
      assert.include(email.text, "didn't")

      assert.isAbove(email.subject.length, 0)
      for (const part of [email.subject, email.html, email.text]) {
        assert.notMatch(part, /\bemails\.[a-z_]+\.[a-z_.]+/, 'a catalog key left unrendered')
      }
    })
})

test.group('T-UI-034 email subjects come from the catalog', () => {
  test('T-UI-034 a template whose subject is missing from the catalog throws instead of sending its key', async ({
    assert,
  }) => {
    // A name the type would refuse, as a typo in a new template would be.
    const missing = 'identity.no_such_email' as string as EmailTemplate
    await assert.rejects(
      () =>
        renderEmail(missing, {
          link: 'https://example.test/',
          minutes: 60,
          hours: 24,
        }),
      InvariantViolation
    )
  })
})
