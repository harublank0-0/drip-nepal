import { test } from '@japa/runner'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureTree, git, runScript } from '#tests/support/scripts'

/*
 * T-SEC-025, the secret-scan half (docs/07 TM-25, §7.2): secretlint's
 * recommended rules over every blob of the history, so a secret committed
 * and deleted later still fails. The token below is assembled at run time
 * and is not a real token; the pre-commit scan never sees it spelled.
 */

const TOKEN = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0', 'K1l2M3n4O5p6Q7r8'].join('')

async function repository(history: (root: string) => Promise<void>) {
  const tree = await fixtureTree({ 'README.md': '# Fixture\n' })
  await copyFile(join(process.cwd(), '.secretlintrc.json'), join(tree.root, '.secretlintrc.json'))
  await git(tree.root, 'init', '-q', '-b', 'main')
  await git(tree.root, 'add', '.')
  await git(tree.root, 'commit', '-qm', 'base')
  await history(tree.root)
  return tree
}

test.group('T-SEC-025 secret scan over the history', (group) => {
  group.each.timeout(60_000)

  test('T-SEC-025 a history without secrets passes', async ({ assert }) => {
    const tree = await repository(async () => {})
    try {
      const result = await runScript('scan_secrets.mjs', ['--root', tree.root])
      assert.equal(result.code, 0, result.stderr)
      assert.include(result.stdout, 'hold no secret')
    } finally {
      await tree.cleanup()
    }
  })

  test('T-SEC-025 a token committed and then deleted still fails, masked', async ({ assert }) => {
    const tree = await repository(async (root) => {
      await writeFile(join(root, 'deploy.env'), `GITHUB_TOKEN=${TOKEN}\n`)
      await git(root, 'add', 'deploy.env')
      await git(root, 'commit', '-qm', 'oops')
      await rm(join(root, 'deploy.env'))
      await git(root, 'commit', '-qam', 'remove it')
    })
    try {
      const result = await runScript('scan_secrets.mjs', ['--root', tree.root])
      assert.equal(result.code, 1)
      assert.include(result.stderr, 'deploy.env (blob')
      assert.include(result.stderr, 'GITHUB_TOKEN')
      assert.notInclude(result.stderr, TOKEN)
    } finally {
      await tree.cleanup()
    }
  })

  test('T-SEC-025 a path in .secretlintignore is skipped', async ({ assert }) => {
    const tree = await repository(async (root) => {
      await writeFile(join(root, '.secretlintignore'), 'fixtures/**\n')
      await writeFile(join(root, 'fixtures.txt'), 'nothing\n')
      await git(root, 'add', '.')
      await git(root, 'commit', '-qm', 'ignore list')
      await mkdir(join(root, 'fixtures'))
      await writeFile(join(root, 'fixtures', 'token.txt'), `${TOKEN}\n`)
      await git(root, 'add', '.')
      await git(root, 'commit', '-qm', 'fixture')
    })
    try {
      const result = await runScript('scan_secrets.mjs', ['--root', tree.root])
      assert.equal(result.code, 0, result.stderr)
    } finally {
      await tree.cleanup()
    }
  })
})
