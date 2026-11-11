import { test } from '@japa/runner'
import {
  isPersonalField,
  maskPersonalText,
  personalValueIn,
} from '#modules/audit/domain/personal_values'

/*
 * T-SEC-102, the guard part (docs/04a §15.3): what the audit writer refuses
 * in `changes` and masks in `reason`. The writer's own test is
 * tests/functional/audit/record_audit.spec.ts.
 */

test.group('T-SEC-102 the personal-values guard', () => {
  test('{name} is personal')
    .with(['email', 'full_name', 'grievance_contact_name', 'account_name', 'phone_enc', 'note'])
    .run(({ assert }, name) => {
      assert.isTrue(isPersonalField(name))
    })

  test('{name} is not personal')
    .with(['status', 'total_minor', 'contact_email', 'changed', 'flags', 'reason_code'])
    .run(({ assert }, name) => {
      assert.isFalse(isPersonalField(name))
    })

  test('a personal member is found at {path}')
    .with([
      { changes: { after: { full_name: 'Sita Shrestha' } }, path: 'changes.after.full_name' },
      { changes: { before: { email: null } }, path: 'changes.before.email' },
      {
        changes: { rows: [{ status: 'x' }, { phone_enc: 'v1.k.c' }] },
        path: 'changes.rows[1].phone_enc',
      },
      { changes: { invitee: 'ram.thapa@example.com' }, path: 'changes.invitee' },
      { changes: { note: 'call me' }, path: 'changes.note' },
      { changes: { contact: ['+977 9841234567'] }, path: 'changes.contact[0]' },
      { changes: { contact: 'call 9812345678 today' }, path: 'changes.contact' },
    ])
    .run(({ assert }, { changes, path }) => {
      assert.equal(personalValueIn(changes), path)
    })

  test('names, amounts, statuses and flags pass', ({ assert }) => {
    const changes = {
      changed: ['grievance_contact_name', 'account_name'],
      before: { status: 'pending_review', commission_rate_bps: 1000 },
      after: { status: 'active', total_minor: 9841234567 },
      flags: ['single_operator'],
      contact_email: null,
    }
    assert.isNull(personalValueIn(changes))
  })

  test('a reason keeps its words and loses emails and phone numbers', ({ assert }) => {
    assert.equal(
      maskPersonalText('Customer ram.thapa@example.com (+977-9841234567, 9812345678) asked twice.'),
      'Customer [email] ([phone], [phone]) asked twice.'
    )
    assert.equal(
      maskPersonalText('Order DN-7Q2K4M9 refunded in full.'),
      'Order DN-7Q2K4M9 refunded in full.'
    )
  })
})
