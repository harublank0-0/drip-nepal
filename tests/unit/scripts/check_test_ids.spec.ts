import { test } from '@japa/runner'
import { fixtureTree, runScript } from '#tests/support/scripts'

/*
 * T-ARCH-033: every test ID cited under tests/, scripts/ or
 * .github/workflows/ is registered in docs/10 §6 (docs/10 §6.1); registered
 * IDs no test cites yet are listed, not failed.
 */

// Assembled at run time, so this file cites no unregistered ID itself.
const UNREGISTERED = ['T', 'ARCH', '099'].join('-')

const REGISTRY = [
  '# Testing',
  '',
  '## 6. Test ID registry',
  '',
  '| ID | Behaviour |',
  '| --- | --- |',
  '| `T-ARCH-001` | Module rules |',
  '| `T-SEC-025` | Secret scan |',
  '',
  '## 7. Held work',
  '',
  `| \`${UNREGISTERED}\` | outside the registry section |`,
  '',
].join('\n')

async function check(files: Record<string, string>) {
  const tree = await fixtureTree({ 'docs/10-testing-and-quality-gates.md': REGISTRY, ...files })
  try {
    return await runScript('check_test_ids.mjs', ['--root', tree.root])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-ARCH-033 every cited test ID is registered', (group) => {
  group.each.timeout(30_000)

  test('T-ARCH-033 the repository passes', async ({ assert }) => {
    const result = await runScript('check_test_ids.mjs')
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stdout, /cited test ID\(s\) are registered/)
  })

  test('T-ARCH-033 registered citations pass and uncited IDs are listed', async ({ assert }) => {
    const result = await check({
      'tests/unit/a.spec.ts': "test('T-ARCH-001 rules', () => {})\n",
    })
    assert.equal(result.code, 0, result.stderr)
    assert.include(result.stdout, '1 of 2 registered ID(s) are not cited by a test yet:\nT-SEC-025')
  })

  test('T-ARCH-033 fails on an unregistered ID in {path}')
    .with([
      { path: 'tests/unit/a.spec.ts' },
      { path: 'scripts/check_thing.mjs' },
      { path: '.github/workflows/ci.yml' },
    ])
    .run(async ({ assert }, { path }) => {
      // The ID sits after "## 7.", outside the registry.
      const result = await check({ [path]: `one line\n// ${UNREGISTERED} a new check\n` })
      assert.equal(result.code, 1)
      assert.include(result.stderr, `${path}:2: ${UNREGISTERED} is not registered`)
    })

  test('T-ARCH-033 fails on an ID with four digits instead of ignoring it', async ({ assert }) => {
    const malformed = ['T', 'SEC', '0251'].join('-')
    const result = await check({ 'tests/unit/a.spec.ts': `test('${malformed} typo', () => {})\n` })
    assert.equal(result.code, 1)
    assert.include(result.stderr, `${malformed} is not T-<AREA>-<three digits>`)
  })
})
