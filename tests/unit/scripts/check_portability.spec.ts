import { test } from '@japa/runner'
import { join } from 'node:path'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-ARCH-030: nothing in the repository points outside it (AGENTS.md, docs/10
 * §5.1): no absolute home-directory path, no local file URL and no name of a
 * local-only planning source. The paths below are assembled at run time, so
 * this file itself never spells one.
 */

const HOME = ['', 'home', 'someone', 'notes', 'plan.md'].join('/')
const MAC = ['', 'Users', 'someone', 'Desktop', 'plan.md'].join('/')
const WINDOWS = ['C:', 'Users', 'someone', 'plan.md'].join('\\')
const FILE_URL = ['file:', '', '', 'srv', 'plan.md'].join('/')

async function check(files: Record<string, string>, denylist?: string) {
  const tree = await fixtureTree({ ...files, ...(denylist ? { 'denylist.txt': denylist } : {}) })
  try {
    const args = ['--root', tree.root]
    if (denylist) args.push('--denylist', join(tree.root, 'denylist.txt'))
    return await runScript('check_portability.mjs', args)
  } finally {
    await tree.cleanup()
  }
}

test.group('T-ARCH-030 portability: no local paths or local-only source names', () => {
  test('T-ARCH-030 the repository passes', async ({ assert }) => {
    const result = await runScript('check_portability.mjs')
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-ARCH-030 fails on {case}')
    .with([
      { case: 'a Linux home path in a document', text: `See ${HOME} for the plan.` },
      { case: 'a macOS home path in a code comment', text: `// copied from ${MAC}` },
      { case: 'a Windows home path', text: `Source: ${WINDOWS}` },
      { case: 'a local file URL', text: `[plan](${FILE_URL})` },
    ])
    .run(async ({ assert }, { text }) => {
      const result = await check({ 'docs/guide.md': `# Guide\n\n${text}\n` })
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'docs/guide.md:3: matches')
    })

  test('T-ARCH-030 the audit module, the word canonical and repository paths pass', async ({
    assert,
  }) => {
    const result = await check({
      'docs/guide.md':
        '# Guide\n\nThe `audit` module and the canonical chain. See app/modules/audit/ and inertia/pages/customers/home/index.tsx, ~/components/ui.\n',
    })
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-ARCH-030 a name added to the denylist fails wherever it is spelled', async ({
    assert,
  }) => {
    const result = await check(
      { 'app/note.ts': '// as the private-roadmap draft says\n' },
      '# local-only sources\nprivate-roadmap\n'
    )
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'app/note.ts:1: matches /private-roadmap/')
  })
})
