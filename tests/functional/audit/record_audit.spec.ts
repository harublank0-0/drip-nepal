import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { hmacKeys } from '#config/crypto'
import { InvariantViolation } from '#exceptions/programming_errors'
import { ipHash } from '#modules/platform/crypto/keyed_hash'
import {
  auditEmailSubject,
  auditIpHash,
  recordAudit,
  type AuditEntry,
} from '#modules/audit/actions/record_audit'
import { insertUser } from '#tests/support/schema_rows'

/*
 * The `audit_logs` writer (docs/04a §15.3):
 * - T-SEC-102: fixture personal values never reach `changes` or `reason`;
 *   a personal column in `changes` is refused before anything is written.
 * - T-SEC-101, the audit part: a failed login for an unknown 254-character
 *   email writes one `auth.login_failed` row whose `subject_id` is the
 *   64-character email hash, with the 32-byte IP hash and the request ID.
 *   The M1 `logIn` action writes the row; here the writer is called as it
 *   will call it.
 */

// The fixture personal values of T-SEC-102.
const FIXTURE = {
  email: 'sita.shrestha@example.com',
  name: 'Sita Shrestha',
  phone: '9841234567',
}

const auditRows = (action: string) => db.from('audit_logs').where('action', action)

function staffEntry(actorUserId: string, overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    actorType: 'platform_staff',
    actorUserId,
    actorRole: 'platform:platform_admin',
    action: 'shop.update_grievance_contact',
    subjectType: 'shop',
    subjectId: '0195f3a0-0000-7000-8000-000000000001',
    requestId: 'req-audit-1',
    ...overrides,
  }
}

test.group('T-SEC-102 no personal value in audit changes or reason', () => {
  test('T-SEC-102 a personal column is recorded by name and the reason is masked', async ({
    assert,
  }) => {
    const staff = await insertUser()
    await db.transaction(async (trx) => {
      await recordAudit(
        trx,
        staffEntry(staff, {
          changes: {
            changed: ['grievance_contact_name', 'grievance_contact_phone_enc'],
            before: { status: 'active' },
            after: { status: 'active' },
          },
          reason: `Owner asked by email ${FIXTURE.email}, phone ${FIXTURE.phone}.`,
        })
      )
    })

    const [row] = await auditRows('shop.update_grievance_contact')
    assert.deepEqual(row.changes, {
      changed: ['grievance_contact_name', 'grievance_contact_phone_enc'],
      before: { status: 'active' },
      after: { status: 'active' },
    })
    assert.equal(row.reason, 'Owner asked by email [email], phone [phone].')
    const stored = JSON.stringify([row.changes, row.reason])
    for (const value of Object.values(FIXTURE)) assert.notInclude(stored, value)
  })

  test('T-SEC-102 {label} in changes is refused and nothing is written')
    .with<{ label: string; changes: AuditEntry['changes'] }[]>([
      { label: 'a name', changes: { after: { full_name: FIXTURE.name } } },
      { label: 'an email', changes: { after: { invitee: FIXTURE.email } } },
      { label: 'a phone number', changes: { before: { contact: `+977${FIXTURE.phone}` } } },
    ])
    .run(async ({ assert }, { changes }) => {
      const staff = await insertUser()
      const error = await db
        .transaction((trx) =>
          recordAudit(trx, staffEntry(staff, { action: 'shop.refused', changes }))
        )
        .then(
          () => null,
          (e) => e
        )
      assert.instanceOf(error, InvariantViolation)
      assert.lengthOf(await auditRows('shop.refused'), 0)
    })

  test('the row belongs to the caller transaction [AC-J00-09]', async ({ assert }) => {
    const staff = await insertUser()
    await db
      .transaction(async (trx) => {
        await recordAudit(trx, staffEntry(staff, { action: 'shop.rolled_back' }))
        throw new Error('the change failed')
      })
      .catch(() => {})
    assert.lengthOf(await auditRows('shop.rolled_back'), 0)
  })
})

test.group('T-SEC-101 a failed login for an unknown long email', () => {
  test('T-SEC-101 one auth.login_failed row with the 64-character email hash', async ({
    assert,
  }) => {
    const email = `${'s'.repeat(242)}@example.com`
    assert.lengthOf(email, 254)
    const ip = '2001:db8:aa:bb::7'

    await db.transaction((trx) =>
      recordAudit(trx, {
        actorType: 'customer',
        action: 'auth.login_failed',
        subjectType: 'email_hash',
        subjectId: auditEmailSubject(email),
        requestId: 'req-login-254',
        ipHash: auditIpHash(ip),
      })
    )

    const rows = await auditRows('auth.login_failed').where('request_id', 'req-login-254')
    assert.lengthOf(rows, 1)
    const [row] = rows
    assert.match(row.subject_id, /^[0-9a-f]{64}$/)
    // The same email in another case and with spaces is the same subject.
    assert.equal(row.subject_id, auditEmailSubject(` ${email.toUpperCase()} `))
    assert.isNull(row.actor_user_id)
    assert.lengthOf(row.ip_hash, 32)
    assert.deepEqual(row.ip_hash, ipHash(hmacKeys.auditIp.release(), ip))
    assert.notInclude(JSON.stringify(row), 'example.com')
  })
})
