import { test } from '@japa/runner'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureTree, git, runScript } from '#tests/support/scripts'

/*
 * T-SEC-026, the repository half (docs/07 TM-26, docs/09 §10.2): lockfile
 * tarballs come from registry.npmjs.org, components.json names no registry
 * but @shadcnuikit (and that one only once VX-13 clears), and a pull request
 * changes pnpm-lock.yaml alone only under the `dependencies` label. CI runs
 * `pnpm audit --prod --audit-level high`, the advisory half, beside it.
 */

const LOCK = `lockfileVersion: '9.0'\npackages:\n  left-pad@1.3.0:\n    resolution: {integrity: sha512-abc}\n`
const COMPONENTS = { style: 'radix-nova', aliases: { ui: '~/components/ui' } }

async function check(files: Record<string, string | undefined>, args: string[] = []) {
  const tree = await fixtureTree({
    'pnpm-lock.yaml': LOCK,
    'components.json': JSON.stringify(COMPONENTS),
    ...files,
  })
  try {
    return await runScript('check_dependency_policy.mjs', ['--root', tree.root, ...args])
  } finally {
    await tree.cleanup()
  }
}

test.group('T-SEC-026 lockfile sources and components.json registries', () => {
  test('T-SEC-026 the repository passes', async ({ assert }) => {
    const result = await runScript('check_dependency_policy.mjs')
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-SEC-026 a registry-only lockfile and no registries pass', async ({ assert }) => {
    const result = await check({
      'pnpm-lock.yaml': `${LOCK}  b@1.0.0:\n    resolution: {tarball: https://registry.npmjs.org/b/-/b-1.0.0.tgz}\n`,
    })
    assert.equal(result.code, 0, result.stderr)
  })

  test('T-SEC-026 fails on {case}')
    .with([
      {
        case: 'a tarball from another host',
        files: {
          'pnpm-lock.yaml': `${LOCK}  evil@1.0.0:\n    resolution: {tarball: https://evil.example/evil-1.0.0.tgz}\n`,
        },
        expected: 'tarball https://evil.example/evil-1.0.0.tgz is not on',
      },
      {
        case: 'a git resolution',
        files: {
          'pnpm-lock.yaml': `${LOCK}  forked@1.0.0:\n    resolution: {commit: 0123abcd, repo: https://github.com/someone/forked.git, type: git}\n`,
        },
        expected: 'a git or directory resolution is not allowed',
      },
      {
        case: 'a local folder resolution',
        files: {
          'pnpm-lock.yaml': `${LOCK}  local@1.0.0:\n    resolution: {directory: ../local, type: directory}\n`,
        },
        expected: 'a git or directory resolution is not allowed',
      },
      {
        case: 'the @commercn registry',
        files: {
          'components.json': JSON.stringify({
            ...COMPONENTS,
            registries: { '@commercn': 'https://commercn.com/r/{name}.json' },
          }),
        },
        expected: 'registry @commercn',
      },
      {
        case: '@shadcnuikit before VX-13 clears',
        files: {
          'components.json': JSON.stringify({
            ...COMPONENTS,
            registries: { '@shadcnuikit': 'https://shadcnuikit.com/r/{name}.json' },
          }),
        },
        expected: 'only once VX-13 clears',
      },
      {
        case: 'a literal key in a registry header',
        files: {
          'components.json': JSON.stringify({
            ...COMPONENTS,
            registries: {
              '@shadcnuikit': {
                url: 'https://shadcnuikit.com/r/{name}.json',
                headers: { Authorization: 'Bearer abc123' },
              },
            },
          }),
        },
        expected: 'must use ${SHADCNUIKIT_API_KEY}',
      },
    ])
    .run(async ({ assert }, { files, expected }) => {
      const result = await check(files)
      assert.equal(result.code, 1)
      assert.include(result.stderr, expected)
    })
})

test.group('T-SEC-026 a lockfile-only change needs the dependencies label', (group) => {
  group.each.timeout(30_000)

  async function pullRequest(changed: string[], labels: string) {
    const tree = await fixtureTree({
      'pnpm-lock.yaml': LOCK,
      'package.json': '{"name":"fixture"}\n',
      'pnpm-workspace.yaml': 'allowBuilds: {}\n',
      'components.json': JSON.stringify(COMPONENTS),
    })
    try {
      await git(tree.root, 'init', '-q', '-b', 'main')
      await git(tree.root, 'add', '.')
      await git(tree.root, 'commit', '-qm', 'base')
      await git(tree.root, 'checkout', '-qb', 'feature')
      for (const file of changed) {
        await writeFile(
          join(tree.root, file),
          `${file === 'pnpm-lock.yaml' ? LOCK : '{}'}\n# changed\n`
        )
      }
      await git(tree.root, 'commit', '-qam', 'change')
      return await runScript('check_dependency_policy.mjs', [
        '--root',
        tree.root,
        '--base',
        'main',
        '--labels',
        labels,
      ])
    } finally {
      await tree.cleanup()
    }
  }

  test('T-SEC-026 fails on pnpm-lock.yaml alone without the label', async ({ assert }) => {
    const result = await pullRequest(['pnpm-lock.yaml'], 'enhancement')
    assert.equal(result.code, 1)
    assert.include(result.stderr, 'only a pull request labelled "dependencies"')
  })

  test('T-SEC-026 passes with {case}')
    .with([
      { case: 'the dependencies label', changed: ['pnpm-lock.yaml'], labels: 'ci,dependencies' },
      { case: 'package.json changed too', changed: ['pnpm-lock.yaml', 'package.json'], labels: '' },
      {
        case: 'pnpm-workspace.yaml changed too',
        changed: ['pnpm-lock.yaml', 'pnpm-workspace.yaml'],
        labels: '',
      },
    ])
    .run(async ({ assert }, { changed, labels }) => {
      const result = await pullRequest(changed, labels)
      assert.equal(result.code, 0, result.stderr)
    })
})
