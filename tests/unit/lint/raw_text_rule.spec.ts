import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-UI-022, the raw-text lint part (docs/08 §11.8, NFR-I18N-001; deferred
 * to E10 by docs/10 note 49): `react/jsx-no-literals` refuses text written
 * straight into JSX in the project's pages, components and layouts, so UI
 * text comes from resources/lang/en through t(). The upstream ui/ copies
 * and the development fixtures are exempt. The pseudo-locale run of
 * T-UI-022 comes with the M4 storefront.
 */

const RULE = 'react/jsx-no-literals'
const component = (body: string) =>
  `import { t } from '~/lib/i18n'\nexport default function A() {\n  return ${body}\n}\n`

test.group('T-UI-022 raw text in JSX', () => {
  test('T-UI-022 text written into JSX fails in {file}')
    .with([
      { file: 'inertia/pages/storefront/home.tsx' },
      { file: 'inertia/components/errors/error_screen.tsx' },
      { file: 'inertia/layouts/root_layout.tsx' },
    ])
    .run(async ({ assert }, { file }) => {
      assert.deepEqual(await lintMessages(component('<p>Add to cart</p>'), file, [RULE]), [
        `3:${RULE}`,
      ])
    })

  test('T-UI-022 text from t() passes, and props are not checked', async ({ assert }) => {
    const code = component(`<p title="x">{t('errors.not_found.body')}{' '}</p>`)
    assert.deepEqual(await lintMessages(code, 'inertia/pages/storefront/home.tsx', [RULE]), [])
  })

  test('T-UI-022 {file} is exempt')
    .with([
      { file: 'inertia/components/ui/button.tsx' },
      { file: 'inertia/pages/dev/overlays.tsx' },
    ])
    .run(async ({ assert }, { file }) => {
      assert.deepEqual(await lintMessages(component('<p>Add to cart</p>'), file, [RULE]), [])
    })
})
