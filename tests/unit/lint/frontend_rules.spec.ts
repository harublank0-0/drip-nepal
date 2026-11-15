import { test } from '@japa/runner'
import { lintMessages } from '#tests/support/lint'

/*
 * T-ARCH-021: the frontend rules of eslint.config.js (docs/09 §11.2, §13.4,
 * §13.8, docs/08 §12): import bans, browser storage only through
 * inertia/lib/storage.ts, no dangerouslySetInnerHTML, and the ui/ and kit/
 * import boundary.
 */

const PAGE = 'inertia/pages/catalog/show.tsx'

test.group('T-ARCH-021 frontend lint rules', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-021 a page may not import {specifier}')
    .with([
      { specifier: "{ useForm } from '@inertiajs/react'" },
      { specifier: "{ Form } from '@inertiajs/react'" },
      { specifier: "{ useTuyau } from '@adonisjs/inertia/react'" },
      { specifier: "{ z } from 'zod'" },
      { specifier: "{ useForm as rhf } from 'react-hook-form'" },
      { specifier: "Link from 'next/link'" },
      { specifier: "{ Dialog } from '@base-ui/react/dialog'" },
      { specifier: "cn from 'cn'" },
    ])
    .run(async ({ assert }, { specifier }) => {
      // Only no-restricted-imports is read, so the unused binding does not matter.
      const code = `import ${specifier}\n`
      assert.deepEqual(await lintMessages(code, PAGE, ['no-restricted-imports']), [
        '1:no-restricted-imports',
      ])
    })

  test('T-ARCH-021 Head, usePage and Link from Inertia pass', async ({ assert }) => {
    const code =
      "import { Head, Link, usePage } from '@inertiajs/react'\nexport const used = [Head, Link, usePage]\n"
    assert.deepEqual(await lintMessages(code, PAGE, ['no-restricted-imports']), [])
  })

  test('T-ARCH-021 localStorage and sessionStorage fail outside inertia/lib/storage.ts', async ({
    assert,
  }) => {
    const code =
      "export const read = () => [localStorage.getItem('a'), sessionStorage.getItem('b')]\n"
    assert.deepEqual(await lintMessages(code, PAGE, ['no-restricted-globals']), [
      '1:no-restricted-globals',
      '1:no-restricted-globals',
    ])
    assert.deepEqual(
      await lintMessages(code, 'inertia/lib/storage.ts', ['no-restricted-globals']),
      []
    )
  })

  test('T-ARCH-021 dangerouslySetInnerHTML fails', async ({ assert }) => {
    const code =
      'export const Raw = ({ html }: { html: string }) => <div dangerouslySetInnerHTML={{ __html: html }} />\n'
    assert.deepEqual(
      await lintMessages(code, 'inertia/components/seo/raw.tsx', ['react/no-danger']),
      ['1:react/no-danger']
    )
  })

  test('T-ARCH-021 {folder}/ imports only ui/ and ~/lib/utils')
    .with([{ folder: 'ui' }, { folder: 'kit' }])
    .run(async ({ assert }, { folder }) => {
      const code =
        "import { Button } from '~/components/ui/button'\nimport { cn } from '~/lib/utils'\nimport { Price } from '~/components/catalog/price'\nexport const used = [Button, cn, Price]\n"
      assert.deepEqual(
        await lintMessages(code, `inertia/components/${folder}/card.tsx`, [
          'no-restricted-imports',
        ]),
        ['3:no-restricted-imports']
      )
    })
})
