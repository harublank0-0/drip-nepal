import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-SEC-038: the advisories pnpm ignores (`auditConfig.ignoreGhsas` in
 * pnpm-workspace.yaml) equal the rows of security/audit-exceptions.md, each
 * row has a package, a reason and an acceptor, and none has expired
 * (docs/09 §10.3).
 */

const ID_A = 'GHSA-2222-3333-4444'
const ID_B = 'GHSA-cfgh-jmpq-rvwx'

const workspace = (ids: string[]) =>
  `allowBuilds:\n  esbuild: true\nauditConfig:\n  ignoreGhsas:\n${ids.map((id) => `    - ${id}\n`).join('')}overrides:\n  foo: 1.0.0\n`

const row = (id: string, expires = '2026-12-31', reason = 'No fix in range') =>
  `| ${id} | \`pkg\` 1.0.0 | ${reason} | Tech lead | ${expires} |`

const exceptions = (rows: string[]) =>
  [
    '# Advisory exceptions',
    '',
    '| GHSA | Package | Reason | Accepted by | Expires |',
    '| - | - | - | - | - |',
    ...rows,
    '',
  ].join('\n')

async function check(ids: string[], rows: string[], today = '2026-11-15') {
  const tree = await fixtureTree({
    'pnpm-workspace.yaml': workspace(ids),
    'exceptions.md': exceptions(rows),
  })
  try {
    return await runScript('check_audit_exceptions.mjs', [
      '--workspace',
      join(tree.root, 'pnpm-workspace.yaml'),
      '--exceptions',
      join(tree.root, 'exceptions.md'),
      '--today',
      today,
    ])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-SEC-038 advisory exceptions agree and are current', () => {
  test('T-SEC-038 the repository passes', async ({ assert }) => {
    const result = await runScript('check_audit_exceptions.mjs')
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-SEC-038 matching, current rows pass, the expiry day included', async ({ assert }) => {
    const result = await check([ID_A, ID_B], [row(ID_A), row(ID_B, '2026-11-15')])
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, '2 advisory exception(s)')
  })

  test('T-SEC-038 fails on {case}')
    .with([
      {
        case: 'an ignored ID without a row',
        ids: [ID_A, ID_B],
        rows: [row(ID_A)],
        expected: `${ID_B} is ignored in`,
      },
      {
        case: 'a row whose ID pnpm does not ignore',
        ids: [ID_A],
        rows: [row(ID_A), row(ID_B)],
        expected: `${ID_B} has a row in`,
      },
      {
        case: 'an expired row',
        ids: [ID_A],
        rows: [row(ID_A, '2026-11-14')],
        expected: 'expired on 2026-11-14',
      },
      {
        case: 'a date that does not exist',
        ids: [ID_A],
        rows: [row(ID_A, '2026-02-30')],
        expected: 'is not a YYYY-MM-DD date',
      },
      {
        case: 'a row without a reason',
        ids: [ID_A],
        rows: [row(ID_A, '2026-12-31', '')],
        expected: 'needs a package, a reason and who accepted it',
      },
      {
        case: 'an ignored value that is not a GHSA ID',
        ids: ['CVE-2026-0001'],
        rows: [],
        expected: '"CVE-2026-0001" is not a GHSA ID',
      },
    ])
    .run(async ({ assert }, { ids, rows, expected }) => {
      const result = await check(ids, rows)
      assert.equal(result.code, 1)
      assert.include(result.stderr, expected)
    })
})
