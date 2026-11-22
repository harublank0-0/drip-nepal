import { randomBytes } from 'node:crypto'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import hash from '@adonisjs/core/services/hash'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'
import DemoMarketplaceSeeder, {
  DEMO_ACCOUNTS,
  DEMO_SHOPS,
} from '#database/seeders/dev/01_demo_marketplace_seeder'
import { UserFactory } from '#database/factories/user_factory'
import { DEMO_EMAIL_DOMAIN } from '#modules/identity/queries'
import { staffUser } from '#tests/support/courier_http'

/*
 * T-ARCH-036, the demo marketplace seeder (docs/09 §8.8). Its guards are
 * T-ARCH-019 and T-ARCH-020. Each run writes its credentials file to a
 * temporary path, so a developer's tmp/dev_credentials.json is never
 * touched.
 */

class SeederUnderTest extends DemoMarketplaceSeeder {
  constructor(client: QueryClientContract, path: string) {
    super(client)
    this.credentialsPath = path
  }
  get runPassword() {
    return this.password
  }
}

const files: string[] = []
function credentialsPath() {
  const path = join(tmpdir(), `t-arch-036-${randomBytes(6).toString('hex')}.json`)
  files.push(path)
  return path
}

async function seed(path = credentialsPath()) {
  const seeder = new SeederUnderTest(db.connection(), path)
  await seeder.run()
  return { seeder, path }
}

async function credentials(path: string) {
  return JSON.parse(await readFile(path, 'utf8')) as {
    password: string
    accounts: { email: string; role: string }[]
  }
}

const emails = DEMO_ACCOUNTS.map((account) => account.email)

async function counts() {
  const total = async (table: string) => {
    const row = await db.from(table).count('* as total').first()
    return Number(row?.total)
  }
  return {
    users: await total('users'),
    shops: await total('shops'),
    shop_memberships: await total('shop_memberships'),
    shop_agreements: await total('shop_agreements'),
  }
}

test.group('T-ARCH-036 demo marketplace seeder', (group) => {
  group.teardown(async () => {
    await Promise.all(files.map((path) => rm(path, { force: true })))
  })

  test('T-ARCH-036 creates the demo accounts, shops and members, and no other user', async ({
    assert,
  }) => {
    const before = await counts()
    await seed()

    // Every user the run adds is a demo account, the approver included.
    const after = await counts()
    assert.equal(after.users - before.users, DEMO_ACCOUNTS.length)
    const users = await db.from('users').whereIn('email', emails).orderBy('email')
    assert.lengthOf(users, DEMO_ACCOUNTS.length)
    for (const user of users) assert.isTrue(user.email.endsWith(`@${DEMO_EMAIL_DOMAIN}`))
    for (const user of users) {
      assert.equal(user.status, 'active')
      assert.isNotNull(user.email_verified_at)
    }
    const byEmail = new Map(users.map((user) => [user.email, user.id]))
    const owner = byEmail.get(DEMO_ACCOUNTS[0].email)

    const shops = await db.from('shops').whereIn('slug', ['demo-pasal', 'demo-pasal-2'])
    const shop = (slug: string) => shops.find((row) => row.slug === slug)
    assert.equal(shop('demo-pasal').status, 'active')
    assert.equal(shop('demo-pasal-2').status, 'pending_review')
    for (const row of shops) {
      assert.equal(row.owner_user_id, owner)
      assert.isTrue(row.contact_email.endsWith(`@${DEMO_EMAIL_DOMAIN}`))
    }
    const approver = DEMO_ACCOUNTS.find((account) => account.key === 'approver')!
    assert.equal(shop('demo-pasal').approved_by, byEmail.get(approver.email))
    assert.lengthOf(await db.from('shop_agreements').where('shop_id', shop('demo-pasal').id), 1)

    const members = await db
      .from('shop_memberships')
      .where('shop_id', shop('demo-pasal').id)
      .select('user_id', 'role', 'status')
    assert.sameDeepMembers(
      members,
      DEMO_SHOPS[0].members.map((member) => ({
        user_id: byEmail.get(DEMO_ACCOUNTS.find((a) => a.key === member.account)!.email),
        role: member.role,
        status: 'active',
      }))
    )
  })

  test('T-ARCH-036 writes the password to a 0600 file and never prints it', async ({ assert }) => {
    const printed: string[] = []
    const writes = [process.stdout.write, process.stderr.write]
    const capture = (chunk: unknown) => {
      printed.push(String(chunk))
      return true
    }
    process.stdout.write = capture as typeof process.stdout.write
    process.stderr.write = capture as typeof process.stderr.write
    let run: Awaited<ReturnType<typeof seed>>
    try {
      run = await seed()
    } finally {
      process.stdout.write = writes[0]
      process.stderr.write = writes[1]
    }

    const file = await credentials(run.path)
    assert.equal(file.password, run.seeder.runPassword)
    const { mode } = await stat(run.path)
    assert.equal(mode & 0o777, 0o600)
    assert.sameMembers(
      file.accounts.map((account) => account.email),
      emails
    )
    for (const user of await db.from('users').whereIn('email', emails)) {
      assert.isTrue(await hash.verify(user.password_hash, file.password))
    }
    assert.notInclude(printed.join(''), file.password)
  })

  test('T-ARCH-036 narrows an older, wider credentials file to 0600', async ({ assert }) => {
    const path = credentialsPath()
    await writeFile(path, '{}\n', { mode: 0o644 })
    await seed(path)
    const { mode } = await stat(path)
    assert.equal(mode & 0o777, 0o600)
  })

  test('T-ARCH-036 a second run adds no row and keeps the file true', async ({ assert }) => {
    const first = await seed()
    const before = await counts()
    const stamp = async () => {
      const row = await db.from('users').where('email', DEMO_ACCOUNTS[0].email).first()
      return row.security_stamp as string
    }
    const firstStamp = await stamp()
    const second = await seed()

    assert.deepEqual(await counts(), before)
    assert.notEqual(second.seeder.runPassword, first.seeder.runPassword)
    const file = await credentials(second.path)
    assert.equal(file.password, second.seeder.runPassword)
    const owner = await db.from('users').where('email', DEMO_ACCOUNTS[0].email).first()
    assert.isTrue(await hash.verify(owner.password_hash, second.seeder.runPassword))
    assert.isFalse(await hash.verify(owner.password_hash, first.seeder.runPassword))
    // A new password comes with a new security stamp, as a password change does.
    assert.notEqual(await stamp(), firstStamp)
  })

  test('T-ARCH-036 gives active staff without TOTP a placeholder enrolment', async ({ assert }) => {
    const staff = async (status?: 'suspended') => {
      const user = await (status ? UserFactory.apply(status) : UserFactory).create()
      await db.table('platform_staff').insert({ user_id: user.id, role: 'support_agent' })
      return user.id
    }
    const waiting = await staff()
    const suspended = await staff('suspended')
    const revoked = await staff()
    const revoker = await UserFactory.create()
    await db
      .from('platform_staff')
      .where('user_id', revoked)
      .update({ revoked_at: db.raw('now()'), revoked_by: revoker.id })
    const enrolled = await staffUser('platform_admin')
    const secret = (id: string) => db.from('users').where('id', id).first()
    const enrolledBefore = await secret(enrolled)

    await seed()

    const after = await secret(waiting)
    assert.isNotNull(after.mfa_enabled_at)
    assert.match(after.mfa_totp_secret_enc, /^v1\.factory\./)
    for (const id of [suspended, revoked]) {
      const row = await secret(id)
      assert.isNull(row.mfa_enabled_at)
      assert.isNull(row.mfa_totp_secret_enc)
    }
    const enrolledAfter = await secret(enrolled)
    assert.equal(enrolledAfter.mfa_totp_secret_enc, enrolledBefore.mfa_totp_secret_enc)
  })
})
