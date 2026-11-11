import { createHash } from 'node:crypto'
import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import encryption from '@adonisjs/core/services/encryption'
import hash from '@adonisjs/core/services/hash'
import db from '@adonisjs/lucid/services/db'
import PlatformCreateAdmin, {
  EMAIL_PROMPT,
  EXISTING_ACCOUNT_PROMPT,
  NAME_PROMPT,
  PASSWORD_PROMPT,
  REPEAT_PROMPT,
} from '../../../commands/platform_create_admin.js'
import type { PgBoss } from 'pg-boss'
import { InvariantViolation } from '#exceptions/programming_errors'
import { issueUserToken } from '#modules/identity/actions/issue_user_token'
import { JOB_SCHEMA, setJobBoss } from '#modules/platform/jobs'
import { insertUser } from '#tests/support/schema_rows'

/*
 * `node ace platform:create-admin` (docs/09 §9.1, FR-ADM-005):
 * - T-OPS-019: on an empty database the command creates one user, one
 *   `platform_staff` row with `granted_by` null, a `password_reset` token
 *   (none with `--interactive`), an `mfa_enrollment` token, one queued
 *   `notifications.dispatch` job per token carrying only the row ID and the
 *   encrypted token, and one audit row, and prints no token; a second run
 *   exits 1 and changes nothing; the command has no password flag; an
 *   existing account is granted the role only after confirmation and keeps
 *   its password. The concurrent case is in
 *   tests/concurrency/identity/platform_create_admin.spec.ts; the
 *   `/admin` enrolment gate comes with M1.
 * - T-IAM-112, the `platform:create-admin` part: an `anonymized.invalid`
 *   email is refused, and so is any address in the reserved `.invalid` TLD.
 *
 * Each test runs in the functional suite's global transaction, so the
 * command's transaction and its job sends are rolled back afterwards. The
 * command starts its own send-only pg-boss instance, as it does on a host.
 */

const PASSWORD = 'correct horse battery staple'

type Answers = (command: PlatformCreateAdmin) => void

async function createAdmin(argv: string[], answers?: Answers) {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  const command = await ace.create(PlatformCreateAdmin, argv)
  // As in a release container: only prompts a test answers can be asked.
  command.interactiveTerminal = false
  answers?.(command)
  await command.exec()
  return command
}

const logsOf = (command: PlatformCreateAdmin) => command.logger.getLogs().map((log) => log.message)

// Row counts of every table the command writes.
async function counts() {
  const result = await db.rawQuery(
    `SELECT (SELECT count(*)::int FROM users) AS users,
            (SELECT count(*)::int FROM platform_staff) AS staff,
            (SELECT count(*)::int FROM user_tokens) AS tokens,
            (SELECT count(*)::int FROM audit_logs) AS audits,
            (SELECT count(*)::int FROM ${JOB_SCHEMA}.job WHERE name = 'notifications.dispatch') AS jobs`
  )
  return result.rows[0] as Record<string, number>
}

/*
 * Decrypts as if `offsetMs` had passed: the encrypter compares the
 * message's expiry with `new Date()`, so only argument-less dates move.
 */
function decryptAt(offsetMs: number, value: string, purpose: string) {
  const RealDate = Date
  class Later extends RealDate {
    constructor(...args: ConstructorParameters<typeof Date> | []) {
      if (args.length === 0) super(RealDate.now() + offsetMs)
      else super(...(args as ConstructorParameters<typeof Date>))
    }
  }
  globalThis.Date = Later as DateConstructor
  try {
    return encryption.decrypt<string>(value, purpose)
  } finally {
    globalThis.Date = RealDate
  }
}

// An `active`, verified account of the kind an existing customer has.
async function insertActiveUser() {
  const userId = await insertUser()
  await db
    .from('users')
    .where('id', userId)
    .update({ status: 'active', email_verified_at: new Date() })
  return userId
}

async function userByEmail(email: string) {
  return db.from('users').where('email', email).firstOrFail()
}

async function tokensOf(userId: string) {
  return db.from('user_tokens').where('user_id', userId).orderBy('purpose')
}

async function dispatchJobs(tokenIds: string[]) {
  const result = await db.rawQuery(
    `SELECT data FROM ${JOB_SCHEMA}.job
      WHERE name = 'notifications.dispatch' AND data->>'user_token_id' = ANY(?::text[])`,
    [tokenIds]
  )
  return result.rows.map((row: { data: Record<string, unknown> }) => row.data)
}

test.group('T-OPS-019 platform:create-admin', () => {
  test('T-OPS-019 the invitation creates one admin, two tokens, two queued emails and one audit row', async ({
    assert,
  }) => {
    const before = await counts()
    const command = await createAdmin(['--email=  Ram.Admin@Example.COM ', '--full-name=Ram Admin'])

    command.assertSucceeded()
    const user = await userByEmail('ram.admin@example.com')
    assert.equal(user.status, 'pending_verification')
    assert.isNull(user.email_verified_at)
    assert.equal(user.full_name, 'Ram Admin')

    const staff = await db.from('platform_staff').where('user_id', user.id).firstOrFail()
    assert.equal(staff.role, 'platform_admin')
    assert.isNull(staff.granted_by)
    assert.isNull(staff.revoked_at)

    const tokens = await tokensOf(user.id)
    assert.deepEqual(
      tokens.map((token) => token.purpose),
      ['mfa_enrollment', 'password_reset']
    )
    const lifetimeMinutes = (token: (typeof tokens)[number]) =>
      Math.round((token.expires_at.getTime() - token.created_at.getTime()) / 60_000)
    assert.equal(lifetimeMinutes(tokens[0]), 24 * 60)
    assert.equal(lifetimeMinutes(tokens[1]), 60)

    // One job per token, carrying the row ID and the token encrypted for its purpose only.
    const jobs = await dispatchJobs(tokens.map((token) => token.id))
    assert.lengthOf(jobs, 2)
    const raw: string[] = []
    for (const token of tokens) {
      const job = jobs.find((data: Record<string, unknown>) => data.user_token_id === token.id)!
      assert.sameMembers(Object.keys(job), [
        'event',
        'user_token_id',
        'token_enc',
        'request_id',
        'causation_id',
      ])
      assert.equal(job.event, 'user_token.issued')
      const plain = encryption.decrypt<string>(
        job.token_enc as string,
        `email_token:${token.purpose}`
      )
      assert.isString(plain, 'the job decrypts for its purpose')
      assert.isNull(encryption.decrypt(job.token_enc as string, 'email_token:email_verification'))
      assert.deepEqual(createHash('sha256').update(plain!).digest(), token.token_hash)
      raw.push(plain!)
      // The ciphertext expires with its token (docs/07 §3.8 rule 1).
      const lifetimeMs = token.expires_at.getTime() - token.created_at.getTime()
      const purpose = `email_token:${token.purpose}`
      assert.isString(decryptAt(lifetimeMs - 60_000, job.token_enc as string, purpose))
      assert.isNull(decryptAt(lifetimeMs + 60_000, job.token_enc as string, purpose))
    }

    const audit = await db
      .from('audit_logs')
      .where({ action: 'platform_staff.bootstrap', subject_id: user.id })
    assert.lengthOf(audit, 1)
    assert.equal(audit[0].actor_type, 'system')
    assert.isNull(audit[0].actor_user_id)
    assert.equal(audit[0].subject_type, 'user')
    assert.deepEqual(audit[0].changes, { role: 'platform_admin', mode: 'invitation' })

    assert.deepEqual(await counts(), {
      users: before.users + 1,
      staff: before.staff + 1,
      tokens: before.tokens + 2,
      audits: before.audits + 1,
      jobs: before.jobs + 2,
    })

    // The output names the address masked and never a token.
    const output = logsOf(command).join('\n')
    assert.include(output, 'admin invitation queued for r•••@example.com; expires in 60 minutes')
    assert.include(output, 'TOTP enrolment link queued; expires in 24 hours')
    assert.notInclude(output, 'ram.admin')
    for (const token of raw) assert.notInclude(output, token)
  })

  test('T-OPS-019 --interactive sets the password at the masked prompt and sends no invitation', async ({
    assert,
  }) => {
    const command = await createAdmin(['--interactive'], (cmd) => {
      cmd.prompt.trap(EMAIL_PROMPT).replyWith('sita.admin@example.com')
      cmd.prompt.trap(NAME_PROMPT).replyWith('Sita Admin')
      cmd.prompt.trap(PASSWORD_PROMPT).replyWith(PASSWORD)
      cmd.prompt.trap(REPEAT_PROMPT).replyWith(PASSWORD)
    })

    command.assertSucceeded()
    const user = await userByEmail('sita.admin@example.com')
    assert.equal(user.status, 'active')
    assert.isNotNull(user.email_verified_at)
    assert.isTrue(await hash.verify(user.password_hash, PASSWORD))

    const tokens = await tokensOf(user.id)
    assert.deepEqual(
      tokens.map((token) => token.purpose),
      ['mfa_enrollment']
    )
    assert.lengthOf(await dispatchJobs([tokens[0].id]), 1)
    const audit = await db
      .from('audit_logs')
      .where({ action: 'platform_staff.bootstrap', subject_id: user.id })
      .firstOrFail()
    assert.deepEqual(audit.changes, { role: 'platform_admin', mode: 'interactive' })

    const output = logsOf(command).join('\n')
    assert.include(output, 'platform_admin created for s•••@example.com')
    assert.notInclude(output, PASSWORD)
  })

  test('T-OPS-019 a second run exits 1 and changes nothing', async ({ assert }) => {
    const first = await createAdmin(['--email=first.admin@example.com', '--full-name=First Admin'])
    first.assertSucceeded()
    const before = await counts()

    const second = await createAdmin(['--email=second.admin@example.com', '--full-name=Second'])

    second.assertFailed()
    assert.deepEqual(await counts(), before)
    assert.include(logsOf(second).join('\n'), 'An active platform_admin exists')
  })

  test('T-OPS-019 a revoked admin does not block the bootstrap', async ({ assert }) => {
    const revoker = await insertUser()
    const formerId = await insertUser()
    await db.table('platform_staff').insert({
      user_id: formerId,
      role: 'platform_admin',
      granted_by: revoker,
      revoked_at: new Date(),
      revoked_by: revoker,
    })

    const command = await createAdmin(['--email=new.admin@example.com', '--full-name=New Admin'])

    command.assertSucceeded()
    const user = await userByEmail('new.admin@example.com')
    const admins = await db
      .from('platform_staff')
      .where('role', 'platform_admin')
      .whereNull('revoked_at')
      .select('user_id', 'granted_by')
    assert.deepEqual(admins, [{ user_id: user.id, granted_by: null }])
    const former = await db.from('platform_staff').where('user_id', formerId).firstOrFail()
    assert.isNotNull(former.revoked_at, 'the revoked row is left as it was')
    assert.lengthOf(await tokensOf(user.id), 2)
  })

  test('T-OPS-019 a token whose email job is refused is not issued', async ({ assert }) => {
    const userId = await insertActiveUser()
    // A pg-boss instance whose queue policy refuses the send (sendJob returns null).
    setJobBoss({ send: async () => null } as unknown as PgBoss)
    try {
      await assert.rejects(
        () => db.transaction((trx) => issueUserToken(trx, userId, 'mfa_enrollment')),
        InvariantViolation
      )
    } finally {
      setJobBoss(null)
    }
    assert.isEmpty(await tokensOf(userId))
  })

  test('T-OPS-019 the command has no flag or argument that takes a password', ({ assert }) => {
    const names = PlatformCreateAdmin.flags.map((flag) => flag.flagName)
    assert.sameMembers(names, ['email', 'full-name', 'interactive'])
    assert.isEmpty(PlatformCreateAdmin.args)
    for (const flag of PlatformCreateAdmin.flags) {
      assert.notMatch(`${flag.flagName} ${flag.alias ?? ''}`, /pass|secret|pw/i)
    }
  })

  test('T-OPS-019 an existing account is granted the role only after confirmation, keeping its password', async ({
    assert,
  }) => {
    const userId = await insertActiveUser()
    const before = await db.from('users').where('id', userId).firstOrFail()

    const declined = await createAdmin([`--email=${before.email}`], (cmd) => {
      cmd.prompt.trap(EXISTING_ACCOUNT_PROMPT).reject()
    })
    declined.assertFailed()
    assert.isNull(await db.from('platform_staff').where('user_id', userId).first())

    const granted = await createAdmin([`--email=${before.email}`, '--interactive'], (cmd) => {
      cmd.prompt.trap(EXISTING_ACCOUNT_PROMPT).accept()
    })

    granted.assertSucceeded()
    const after = await db.from('users').where('id', userId).firstOrFail()
    assert.equal(after.password_hash, before.password_hash, 'the password is never changed')
    assert.notEqual(after.security_stamp, before.security_stamp, 'the grant rotates the stamp')
    const staff = await db.from('platform_staff').where('user_id', userId).firstOrFail()
    assert.equal(staff.role, 'platform_admin')
    const tokens = await tokensOf(userId)
    assert.deepEqual(
      tokens.map((token) => token.purpose),
      ['mfa_enrollment']
    )
    const audit = await db
      .from('audit_logs')
      .where({ action: 'platform_staff.bootstrap', subject_id: userId })
      .firstOrFail()
    assert.deepEqual(audit.changes, { role: 'platform_admin', mode: 'existing_account' })
  })

  test('T-OPS-019 an account that is not active is not granted the role: {status}')
    .with([
      { status: 'pending_verification', values: {} },
      { status: 'suspended', values: {} },
      { status: 'deactivated', values: { deletion_requested_at: new Date() } },
    ])
    .run(async ({ assert }, { status, values }) => {
      const userId = await insertUser()
      await db
        .from('users')
        .where('id', userId)
        .update({ status, ...values })
      const { email } = await db.from('users').where('id', userId).firstOrFail()

      const command = await createAdmin([`--email=${email}`], (cmd) => {
        cmd.prompt.trap(EXISTING_ACCOUNT_PROMPT).accept()
      })

      command.assertFailed()
      assert.include(logsOf(command).join('\n'), `The existing account is ${status}`)
      assert.isNull(await db.from('platform_staff').where('user_id', userId).first())
    })

  test('T-OPS-019 an existing admin is refused before the existing-account prompt', async ({
    assert,
  }) => {
    const first = await createAdmin(['--email=first.admin@example.com', '--full-name=First'])
    first.assertSucceeded()
    const userId = await insertActiveUser()
    const { email } = await db.from('users').where('id', userId).firstOrFail()

    // No trap: the prompt must not be reached.
    const second = await createAdmin([`--email=${email}`])

    second.assertFailed()
    assert.include(logsOf(second).join('\n'), 'An active platform_admin exists')
  })

  test('T-OPS-019 without a terminal a needed prompt exits 1 at once: {case}')
    .with([
      { case: 'existing account', argv: 'existing' },
      {
        case: 'password',
        argv: ['--interactive', '--email=tty.admin@example.com', '--full-name=T'],
      },
      { case: 'full name', argv: ['--email=tty.admin@example.com'] },
    ])
    .run(async ({ assert }, row) => {
      let argv = row.argv as string[]
      if (row.argv === 'existing') {
        const userId = await insertActiveUser()
        const { email } = await db.from('users').where('id', userId).firstOrFail()
        argv = [`--email=${email}`]
      }
      const before = await counts()

      const command = await createAdmin(argv)

      command.assertFailed()
      assert.match(logsOf(command).join('\n'), /needs an interactive terminal/)
      assert.deepEqual(await counts(), before)
    })

  test('T-OPS-019 refused input changes nothing: {case}')
    .with([
      { case: 'no email', argv: ['--full-name=No Email'], answers: undefined },
      {
        case: 'passwords that differ',
        argv: ['--interactive', '--email=x.admin@example.com', '--full-name=X'],
        answers: (cmd: PlatformCreateAdmin) => {
          cmd.prompt.trap(PASSWORD_PROMPT).replyWith(PASSWORD)
          cmd.prompt.trap(REPEAT_PROMPT).replyWith(`${PASSWORD}!`)
        },
      },
      {
        case: 'a 9-character password',
        argv: ['--interactive', '--email=x.admin@example.com', '--full-name=X'],
        answers: (cmd: PlatformCreateAdmin) => {
          cmd.prompt.trap(PASSWORD_PROMPT).replyWith('123456789')
          cmd.prompt.trap(REPEAT_PROMPT).replyWith('123456789')
        },
      },
      {
        case: 'a malformed email',
        argv: ['--email=not-an-email', '--full-name=X'],
        answers: undefined,
      },
      {
        case: 'a 101-character name',
        argv: ['--email=x.admin@example.com', `--full-name=${'n'.repeat(101)}`],
        answers: undefined,
      },
    ])
    .run(async ({ assert }, { argv, answers }) => {
      const before = await counts()
      const command = await createAdmin(argv, answers)
      command.assertFailed()
      assert.deepEqual(await counts(), before)
      assert.notInclude(logsOf(command).join('\n'), '123456789')
    })
})

test.group('T-IAM-112 anonymized.invalid refused by platform:create-admin', () => {
  test('T-IAM-112 an address in the reserved anonymized.invalid domain is refused', async ({
    assert,
  }) => {
    const before = await counts()

    const command = await createAdmin([
      '--email=Deleted-1@Anonymized.Invalid',
      '--full-name=Placeholder',
    ])

    command.assertFailed()
    assert.deepEqual(await counts(), before)
    assert.match(logsOf(command).join('\n'), /email: .*reserved domain/)
  })

  test('T-IAM-112 any address in the reserved .invalid TLD is refused: {email}')
    .with([{ email: 'a@b.invalid' }, { email: 'Vendor-1@Dev.DripNepal.INVALID' }])
    .run(async ({ assert }, { email }) => {
      const before = await counts()

      const command = await createAdmin([`--email=${email}`, '--full-name=Stranger'])

      command.assertFailed()
      assert.deepEqual(await counts(), before)
      assert.match(logsOf(command).join('\n'), /email: .*reserved domain/)
    })
})
