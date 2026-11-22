import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runCommand, runScript } from '#tests/support/scripts'

/*
 * T-SEC-014, the email-template grep (docs/09 §11.2, docs/07 TM-11): an HTML
 * email template under resources/views/emails/ prints no raw output (the
 * triple-brace mustache, `html.safe`, `html.attrs`, `toAttrs`) and pulls
 * in no partial that could (a text-only template, or a target outside
 * `emails/` or not a literal path). The reviewed layouts in
 * resources/views/emails/layouts/ and the text-only `*.text.edge`
 * templates may print raw. Without `--root`, finding no template fails.
 * The render half is tests/functional/notifications/email_templates.spec.ts.
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

  test('T-SEC-014 a layout component, also with its path on the next line, passes', async ({
    assert,
  }) => {
    const result = await check({
      [`${EMAILS}/identity/reset.html.edge`]: [
        "@component('emails/layouts/html', { t: t })",
        ESCAPED,
        '@end',
        '@component(',
        "  'emails/layouts/html.edge',",
        '  { t: t }',
        ')',
        '@end',
        "@includeIf(show, 'emails/identity/footer')",
        '',
      ].join('\n'),
    })
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-SEC-014 without --root, finding no template fails; with --root it passes', async ({
    assert,
  }) => {
    const tree = await fixtureTree({ 'README.md': 'no templates here\n' })
    try {
      const script = join(process.cwd(), 'scripts', 'check_email_templates.mjs')
      const bare = await runCommand('node', [script], { cwd: tree.root })
      assert.equal(bare.code, 1)
      assert.include(bare.stderr, 'no HTML email template found')
      const rooted = await runCommand('node', [script, '--root', tree.root])
      assert.equal(rooted.code, 0, rooted.stderr)
    } finally {
      await tree.cleanup()
    }
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
        label: 'html.attrs() in an HTML template',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: `${ESCAPED}<p {{ html.attrs({ id: name }) }}></p>\n`,
        line: 2,
      },
      {
        label: 'html.safe without a call, spaced around the dot',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: '<p>{{ html .safe }}</p>\n',
        line: 1,
      },
      {
        label: 'toAttrs in an HTML template',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: '<a {{ $props.toAttrs() }}></a>\n',
        line: 1,
      },
      {
        label: 'an @include of a text-only template',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: `${ESCAPED}@include('emails/identity/reset.text')\n`,
        line: 2,
      },
      {
        label: 'an @!component of a text-only template named with .edge',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: "@!component('emails/identity/reset.text.edge')\n",
        line: 1,
      },
      {
        label: 'a @component outside emails/',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: `${ESCAPED}@component(\n  'components/button', {}\n)\n@end\n`,
        line: 2,
      },
      {
        label: 'an @includeIf outside emails/',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: "@includeIf(show, 'partials/footer')\n",
        line: 1,
      },
      {
        label: 'an @include that climbs out of emails/',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: "@include('emails/../partials/footer')\n",
        line: 1,
      },
      {
        label: 'an @include whose target is not a literal path',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: '@include(partialName)\n',
        line: 1,
      },
      {
        label: 'an @include whose target is a concatenation',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: "@include('emails/' + partialName)\n",
        line: 1,
      },
      {
        label: 'an @include whose target is a template literal',
        file: `${EMAILS}/identity/reset.html.edge`,
        content: '@include(`emails/${partialName}`)\n',
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
