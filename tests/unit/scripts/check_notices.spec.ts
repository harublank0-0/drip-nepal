import { test } from '@japa/runner'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-UI-024: THIRD_PARTY_NOTICES.md lists exactly the files of
 * inertia/components/ui/ and inertia/components/kit/ (docs/08 §12.4), and
 * a ui/ row lists local changes exactly when its file carries a
 * `dripnepal-change:` comment (08 §12.1).
 */

const HEADER = [
  '| Path | Source | Licence | Retrieved | Last compared | Local changes | Added by, reviewed by |',
  '| --- | --- | --- | --- | --- | --- | --- |',
]
const row = (path: string, local = 'None') =>
  `| \`${path}\` | registry | MIT | 2026-11-20 | 2026-11-20 | ${local} | someone |`
const BUTTON = 'inertia/components/ui/button.tsx'
const SONNER = 'inertia/components/ui/sonner.tsx'
const KIT = 'inertia/components/kit/table1.tsx'
const MARKED = '// dripnepal-change: theme from the caller\nexport {}\n'

const emptyCell = (path: string) =>
  `| \`${path}\` | registry | MIT | 2026-11-20 | 2026-11-20 |  | someone |`

// `header: null` writes no notices file at all.
async function check(
  files: Record<string, string | undefined>,
  rows: string[],
  header: string[] | null = HEADER
) {
  const tree = await fixtureTree({
    ...files,
    'THIRD_PARTY_NOTICES.md': header
      ? ['# Notices', '', ...header, ...rows, ''].join('\n')
      : undefined,
  })
  try {
    return await runScript('check_notices.mjs', ['--root', tree.root])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-UI-024 the notices file matches ui/ and kit/', (group) => {
  group.each.timeout(30_000)

  test('T-UI-024 the repository passes', async ({ assert }) => {
    const result = await runScript('check_notices.mjs')
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-UI-024 a row for every file, with a marked change listed, passes', async ({ assert }) => {
    const result = await check(
      { [BUTTON]: 'export {}\n', [SONNER]: MARKED, [KIT]: 'export {}\n' },
      [row(BUTTON), row(SONNER, 'Theme from the caller'), row(KIT)]
    )
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-UI-024 an escaped pipe inside a cell is not a separator', async ({ assert }) => {
    const result = await check({ [SONNER]: MARKED }, [
      `| \`${SONNER}\` | a \\| b | MIT | 2026-11-20 | 2026-11-20 | Theme from the caller | someone |`,
    ])
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-UI-024 a nested file and an empty cell pass, and dotfiles are skipped', async ({
    assert,
  }) => {
    const nested = 'inertia/components/ui/sub/item.tsx'
    const result = await check(
      { [nested]: 'export {}\n', 'inertia/components/ui/.DS_Store': 'x' },
      [emptyCell(nested)]
    )
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-UI-024 fails when the notices file or its header is missing', async ({ assert }) => {
    const missing = await check({ [BUTTON]: 'export {}\n' }, [], null)
    assert.equal(missing.code, 1)
    assert.include(missing.stderr, 'THIRD_PARTY_NOTICES.md is missing')
    const noHeader = await check({ [BUTTON]: 'export {}\n' }, [row(BUTTON)], [])
    assert.equal(noHeader.code, 1)
    assert.include(noHeader.stderr, 'no table header with a "Local changes" column')
  })

  test('T-UI-024 fails on {case}')
    .with([
      {
        case: 'a ui/ file with no row',
        files: { [BUTTON]: 'export {}\n', [SONNER]: 'export {}\n' },
        rows: [row(BUTTON)],
        message: `${SONNER}: no row in THIRD_PARTY_NOTICES.md`,
      },
      {
        case: 'a kit/ file with no row',
        files: { [KIT]: 'export {}\n' },
        rows: [],
        message: `${KIT}: no row in THIRD_PARTY_NOTICES.md`,
      },
      {
        case: 'a row with no file',
        files: { [BUTTON]: 'export {}\n' },
        rows: [row(BUTTON), row(SONNER)],
        message: `${SONNER} does not exist`,
      },
      {
        case: 'a second row for a file',
        files: { [BUTTON]: 'export {}\n' },
        rows: [row(BUTTON), row(BUTTON)],
        message: `a second row for ${BUTTON}`,
      },
      {
        case: 'a marked change whose row says None',
        files: { [SONNER]: MARKED },
        rows: [row(SONNER)],
        message: `${SONNER} has a dripnepal-change: comment, but its row says None`,
      },
      {
        case: 'a marked change whose cell is empty',
        files: { [SONNER]: MARKED },
        rows: [emptyCell(SONNER)],
        message: `${SONNER} has a dripnepal-change: comment, but its row says None`,
      },
      {
        case: 'a marked change whose cell says none in lower case',
        files: { [SONNER]: MARKED },
        rows: [row(SONNER, 'none')],
        message: `${SONNER} has a dripnepal-change: comment, but its row says None`,
      },
      {
        case: 'an unescaped pipe that shifts the columns',
        files: { [SONNER]: MARKED },
        rows: [
          `| \`${SONNER}\` | a | b | MIT | 2026-11-20 | 2026-11-20 | Theme from the caller | someone |`,
        ],
        message: '8 cells, the header has 7',
      },
      {
        case: 'a listed change with no marker in the file',
        files: { [BUTTON]: 'export {}\n' },
        rows: [row(BUTTON, 'Bigger targets')],
        message: `${BUTTON} lists local changes, but has no dripnepal-change: comment`,
      },
    ])
    .run(async ({ assert }, { files, rows, message }) => {
      const result = await check(files, rows)
      assert.equal(result.code, 1)
      assert.include(result.stderr, message)
    })
})
