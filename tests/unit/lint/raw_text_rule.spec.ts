import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-UI-022, the raw-text lint part (docs/08 §11.8, NFR-I18N-001; deferred
 * to E10 by docs/10 note 49): text written straight into JSX, as a child
 * or a string literal, and literal text in the attributes a user sees or a
 * screen reader speaks, fail in the project's pages, components and
 * layouts, so UI text comes from resources/lang/en through t(). The
 * upstream ui/ copies and the development fixtures are exempt. The
 * pseudo-locale run of T-UI-022 comes with the M4 storefront.
 */

const RULES = ['react/jsx-no-literals', 'no-restricted-syntax']
const PAGE = 'inertia/pages/storefront/home.tsx'
const component = (body: string) =>
  `import { t } from '~/lib/i18n'\nexport default function A() {\n  return ${body}\n}\n`

test.group('T-UI-022 raw text in JSX', () => {
  test('T-UI-022 text written into JSX fails in {file}')
    .with([
      { file: PAGE },
      { file: 'inertia/components/errors/error_screen.tsx' },
      { file: 'inertia/layouts/root_layout.tsx' },
    ])
    .run(async ({ assert }, { file }) => {
      assert.deepEqual(await lintMessages(component('<p>Add to cart</p>'), file, RULES), [
        '3:react/jsx-no-literals',
      ])
    })

  test('T-UI-022 {label} fails')
    .with([
      {
        label: 'a string literal child',
        body: "<p>{'Add to cart'}</p>",
        rule: 'react/jsx-no-literals',
      },
      {
        label: 'a literal placeholder',
        body: '<input placeholder="Search" />',
        rule: 'no-restricted-syntax',
      },
      {
        label: 'a string literal in an attribute',
        body: "<input placeholder={'Search'} />",
        rule: 'no-restricted-syntax',
      },
      {
        label: 'a template literal in an attribute',
        body: '<input placeholder={`Search ${0}`} />',
        rule: 'no-restricted-syntax',
      },
      {
        label: 'a literal aria-label',
        body: '<button aria-label="Close" />',
        rule: 'no-restricted-syntax',
      },
      {
        label: 'a literal alt',
        body: '<img src="/a.jpg" alt="Red kurta" />',
        rule: 'no-restricted-syntax',
      },
      {
        label: 'a literal title',
        body: '<abbr title="Cash on delivery" />',
        rule: 'no-restricted-syntax',
      },
    ])
    .run(async ({ assert }, { body, rule }) => {
      assert.deepEqual(await lintMessages(component(body), PAGE, RULES), [`3:${rule}`])
    })

  test('T-UI-022 text from t(), a lone space, and non-text props pass', async ({ assert }) => {
    const code = component(
      `<p className="text-sm" id="x" alt="" aria-label={t('common.support.contact')}>{t('errors.not_found.body')}{' '}</p>`
    )
    assert.deepEqual(await lintMessages(code, PAGE, RULES), [])
  })

  test('T-UI-022 {file} is exempt')
    .with([
      { file: 'inertia/components/ui/button.tsx' },
      { file: 'inertia/pages/dev/overlays.tsx' },
    ])
    .run(async ({ assert }, { file }) => {
      const code = component('<p aria-label="Close">Add to cart</p>')
      assert.deepEqual(await lintMessages(code, file, RULES), [])
    })
})
