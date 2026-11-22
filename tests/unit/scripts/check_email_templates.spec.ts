import { test } from '@japa/runner'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-SEC-014, the email-template grep (docs/09 §11.2, docs/07 TM-11): an HTML
 * email template under resources/views/emails/ prints no raw output,
 * neither the triple-brace mustache nor `html.safe(`. The reviewed layouts
 * in resources/views/emails/layouts/ and the text-only `*.text.edge`
 * templates may. The render half is
 * tests/functional/notifications/email_templates.spec.ts.
 */

const EMAILS = 'resources/views/emails'
const ESCAPED = "<p>{{ t('emails.identity.reset.intro') }}</p>\n"
const RAW = '<p>{{{ name }}}</p>\n'

async function check(files: Record<string, string>) {
  const tree = await fixtureTree(files)
  try {
    return await runScript('check_email_templates.mjs', ['--root', tree.root])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-SEC-014 the email-template grep', (group) => {
  group.each.timeout(30_000)

  test('T-SEC-014 the repository passes', async ({ assert }) => {
    const result = await runScript('check_email_templates.mjs')
    assert.equal(result.code, 0, result.stderr)
    // It read the real templates, not an empty folder.
    assert.match(result.stdout, /^[1-9]\d* HTML email template/)
  })

  test('T-SEC-014 raw output in a layout or a text-only template passes', async ({ assert }) => {
    const result = await check({
      [`${EMAILS}/identity/reset.html.edge`]: ESCAPED,
      [`${EMAILS}/identity/reset.text.edge`]: '{{{ link }}}\n',
      [`${EMAILS}/layouts/html.edge`]: '{{{ await $slots.main() }}}\n',
    })
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, '1 HTML email template(s)')
  })

  test('T-SEC-014 {label} fails')
    .with([
      {
        label: 'a triple-brace mustache in an HTML template',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: `${ESCAPED}${RAW}`,
        line: 2,
      },
      {
        label: 'a triple brace inside a comment',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: `{{-- {{{ name }}} --}}\n${ESCAPED}`,
        line: 1,
      },
      {
        label: 'html.safe() in an HTML template',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: '<p>{{ html.safe(name) }}</p>\n',
        line: 1,
      },
      {
        label: 'a nested template without the .html suffix',
        file: `${EMAILS}/orders/placed/customer.edge`,
        content: RAW,
        line: 1,
      },
      {
        label: 'a layouts folder below another folder',
        file: `${EMAILS}/identity/layouts/frame.edge`,
        content: RAW,
        line: 1,
      },
    ])
    .run(async ({ assert }, { file, content, line }) => {
      const result = await check({ [file]: content })
      assert.equal(result.code, 1)
      assert.include(result.stderr, `${file}:${line}:`)
    })
})
