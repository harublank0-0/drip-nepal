import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-SEC-038: the advisories pnpm ignores (`auditConfig.ignoreGhsas` in
 * pnpm-workspace.yaml, read with a YAML parser) equal the rows of
 * security/audit-exceptions.md, each row has a package, a reason and a
 * named acceptor, and none has expired (docs/09 §10.3). Every run here
 * passes a fixed --today; the dated check against the real date is CI's.
 */

const TODAY = '2026-11-15'
const ID_A = 'GHSA-2222-3333-4444'
const ID_B = 'GHSA-cfgh-jmpq-rvwx'

const blockList = (ids: string[]) =>
  `allowBuilds:\n  esbuild: true\nauditConfig:\n  ignoreGhsas:\n${ids.map((id) => `    - ${id}\n`).join('')}overrides:\n  foo: 1.0.0\n`

const row = (
  id: string,
  expires = '2026-12-31',
  acceptedBy = 'Tech lead, 2026-11-15',
  reason = 'No fix in range'
) => `| ${id} | \`pkg\` 1.0.0 | ${reason} | ${acceptedBy} | ${expires} |`

const exceptions = (rows: string[]) =>
  [
    '# Advisory exceptions',
    '',
    '| GHSA | Package | Reason | Accepted by | Expires |',
    '| - | - | - | - | - |',
    ...rows,
    '',
  ].join('\n')

async function check(workspace: string, rows: string[]) {
  const tree = await fixtureTree({
    'pnpm-workspace.yaml': workspace,
    'exceptions.md': exceptions(rows),
  })
  try {
    return await runScript('check_audit_exceptions.mjs', [
      '--workspace',
      join(tree.root, 'pnpm-workspace.yaml'),
      '--exceptions',
      join(tree.root, 'exceptions.md'),
      '--today',
      TODAY,
    ])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-SEC-038 advisory exceptions agree, are accepted and are current', (group) => {
  group.each.timeout(30_000)

  test("T-SEC-038 the repository's lists agree; its only findings are acceptances still pending", async ({
    assert,
  }) => {
    const result = await runScript('check_audit_exceptions.mjs', ['--today', TODAY])
    const findings = result.stderr.split('\n').filter(Boolean)
    for (const finding of findings)
      assert.match(finding, /^GHSA-[\w-]+: no one has accepted this exception yet/)
    assert.equal(result.code, findings.length > 0 ? 1 : 0)
  })

  test('T-SEC-038 matching, accepted, current rows pass, the expiry day included', async ({
    assert,
  }) => {
    const result = await check(blockList([ID_A, ID_B]), [row(ID_A), row(ID_B, TODAY)])
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, '2 advisory exception(s)')
  })

  test('T-SEC-038 a {case} list is read like pnpm reads it')
    .with([
      {
        case: 'commented',
        workspace: `auditConfig:\n  ignoreGhsas:\n    - ${ID_A}\n    # the next one is ignored too\n    - ${ID_B}\n`,
      },
      { case: 'flow-style', workspace: `auditConfig: { ignoreGhsas: [${ID_A}, '${ID_B}'] }\n` },
      {
        case: 'quoted-key',
        workspace: `"auditConfig":\n  "ignoreGhsas": ["${ID_A}", "${ID_B}"]\n`,
      },
      {
        case: 'anchored',
        workspace: `ids: &ids [${ID_A}, ${ID_B}]\nauditConfig:\n  ignoreGhsas: *ids\n`,
      },
    ])
    .run(async ({ assert }, { workspace }) => {
      // Only ID_A has a row, so ID_B must be found in every layout.
      const result = await check(workspace, [row(ID_A)])
      assert.equal(result.code, 1)
      assert.include(result.stderr, `${ID_B} is ignored in`)
    })

  test('T-SEC-038 fails on {case}')
    .with([
      {
        case: 'an ignored ID without a row',
        workspace: blockList([ID_A, ID_B]),
        rows: [row(ID_A)],
        expected: `${ID_B} is ignored in`,
      },
      {
        case: 'a row whose ID pnpm does not ignore',
        workspace: blockList([ID_A]),
        rows: [row(ID_A), row(ID_B)],
        expected: `${ID_B} has a row in`,
      },
      {
        case: 'an expired row',
        workspace: blockList([ID_A]),
        rows: [row(ID_A, '2026-11-14')],
        expected: 'expired on 2026-11-14',
      },
      {
        case: 'a date that does not exist',
        workspace: blockList([ID_A]),
        rows: [row(ID_A, '2026-02-30')],
        expected: 'is not a YYYY-MM-DD date',
      },
      {
        case: 'a row without a reason',
        workspace: blockList([ID_A]),
        rows: [row(ID_A, '2026-12-31', 'Tech lead', '')],
        expected: 'needs a package and a reason',
      },
      {
        case: 'an empty acceptor',
        workspace: blockList([ID_A]),
        rows: [row(ID_A, '2026-12-31', '')],
        expected: 'no one has accepted this exception yet',
      },
      {
        case: 'a pending acceptor',
        workspace: blockList([ID_A]),
        rows: [row(ID_A, '2026-12-31', 'PENDING the tech lead')],
        expected: 'no one has accepted this exception yet',
      },
      {
        case: 'an ignored value that is not a GHSA ID',
        workspace: blockList(['CVE-2026-0001']),
        rows: [],
        expected: '"CVE-2026-0001" is not a GHSA ID',
      },
      {
        case: 'another auditConfig key',
        workspace: `auditConfig:\n  ignoreCves: [CVE-2026-0001]\n`,
        rows: [],
        expected: 'auditConfig.ignoreCves is not allowed',
      },
    ])
    .run(async ({ assert }, { workspace, rows, expected }) => {
      const result = await check(workspace, rows)
      assert.equal(result.code, 1)
      assert.include(result.stderr, expected)
    })
})
