import { test } from '@japa/runner'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureTree, git, runScript } from '#tests/support/scripts'

/*
 * T-SEC-025, the secret-scan half (docs/07 TM-25, §7.2): secretlint's
 * recommended rules and the pattern for the secret variables of docs/09
 * §6.1, over every blob of HEAD's history, so a secret committed and
 * deleted later still fails, and over given files (the pre-commit mode). The token below is assembled at run time
 * and is not a real token; the pre-commit scan never sees it spelled.
 */

const TOKEN = ['gh', 'p_', 'A1b2C3d4E5f6G7h8I9j0', 'K1l2M3n4O5p6Q7r8'].join('')

async function repository(history: (root: string) => Promise<void>) {
  const tree = await fixtureTree({ 'README.md': '# Fixture\n' })
  await copyFile(join(process.cwd(), '.secretlintrc.json'), join(tree.root, '.secretlintrc.json'))
  await copyFile(join(process.cwd(), '.secretlintignore'), join(tree.root, '.secretlintignore'))
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

  test('T-SEC-025 a secret variable with a value fails: {line}')
    .with([
      { line: 'APP_KEY=x8Kq2mN5pR7tV9wY1zB3cD6fG8hJ0kL4' },
      { line: 'export DB_PASSWORD="s3cr3t-db-pass"' },
      { line: 'HMAC_KEY_TELEMETRY=ZHJpcG5lcGFsIHByb2QgdGVsZW1ldHJ5' },
      { line: 'SENTRY_DSN=https://abc123@o1.ingest.sentry.io/42' },
      { line: 'S3_SECRET_ACCESS_KEY=AbCdEf0123456789xyzAbCdEf0123456789xyz' },
      { line: 'KHALTI_SECRET_KEY=live_secret_key_0123456789abcdef' },
      { line: 'ESEWA_SECRET_KEY=8gBm/:&EnhH.1/q' },
      { line: 'SHADCNUIKIT_API_KEY=sk_0123456789abcdef' },
    ])
    .run(async ({ assert }, { line }) => {
      const tree = await repository(async (root) => {
        await writeFile(join(root, 'notes.md'), `Set this:\n\n${line}\n`)
        await git(root, 'add', '.')
        await git(root, 'commit', '-qm', 'notes')
      })
      try {
        const result = await runScript('scan_secrets.mjs', ['--root', tree.root])
        assert.equal(result.code, 1)
        assert.include(result.stderr, '[PATTERN]')
      } finally {
        await tree.cleanup()
      }
    })

  test('T-SEC-025 placeholders, empty values and .env.test pass', async ({ assert }) => {
    const tree = await repository(async (root) => {
      await writeFile(
        join(root, 'DEPLOY.md'),
        'SMTP_PASSWORD=the-app-password\nDB_PASSWORD=change-me-to-a-long-random-password\nAPP_KEY=\nAPP_KEY=<generate one>\n# APP_KEY=commented\nS3_SECRET_ACCESS_KEY=change-me\nDATA_ENCRYPTION_ACTIVE_KEY_ID=k2\nS3_ACCESS_KEY_ID=dev-access-key-id\nPUBLIC_KEY_SHA256=3b4c0f\n'
      )
      await writeFile(
        join(root, '.env.test'),
        'APP_KEY=dripnepal-test-only-app-key-not-a-secret\nS3_SECRET_ACCESS_KEY=minio-test-secret\n'
      )
      await git(root, 'add', '.')
      await git(root, 'commit', '-qm', 'templates')
    })
    try {
      const result = await runScript('scan_secrets.mjs', ['--root', tree.root])
      assert.equal(result.code, 0, result.stderr)
    } finally {
      await tree.cleanup()
    }
  })

  test('T-SEC-025 file mode (pre-commit) fails on a staged secret and passes a clean file', async ({
    assert,
  }) => {
    const tree = await repository(async (root) => {
      await writeFile(join(root, 'leak.env'), 'APP_KEY=x8Kq2mN5pR7tV9wY1zB3cD6fG8hJ0kL4\n')
      await writeFile(join(root, 'clean.md'), '# Nothing here\n')
    })
    try {
      const leak = await runScript('scan_secrets.mjs', [
        '--root',
        tree.root,
        join(tree.root, 'leak.env'),
      ])
      assert.equal(leak.code, 1)
      assert.include(leak.stderr, 'leak.env')
      const clean = await runScript('scan_secrets.mjs', [
        '--root',
        tree.root,
        join(tree.root, 'clean.md'),
      ])
      assert.equal(clean.code, 0, clean.stderr)
    } finally {
      await tree.cleanup()
    }
  })
})
