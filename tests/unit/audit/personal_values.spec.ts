import { test } from '@japa/runner'
import {
  isPersonalField,
  isPersonalIdentifier,
  looksPersonal,
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
    .with([
      'email',
      'full_name',
      'grievance_contact_name',
      'account_name',
      'phone_enc',
      'note',
      'fullName',
      'grievanceContactName',
      'phoneEnc',
    ])
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
      { changes: { after: { contactName: 'Sita' } }, path: 'changes.after.contactName' },
      { changes: { after: { contact: 9812345678 } }, path: 'changes.after.contact' },
      { changes: { after: { contact: [9812345678] } }, path: 'changes.after.contact[0]' },
    ])
    .run(({ assert }, { changes, path }) => {
      assert.equal(personalValueIn(changes), path)
    })

  test('names, amounts, statuses and flags pass', ({ assert }) => {
    const changes = {
      changed: ['grievance_contact_name', 'account_name'],
      before: { status: 'pending_review', commission_rate_bps: 1000 },
      // Money members are integer paisa, never a phone number (ADR-0007).
      after: { status: 'active', total_minor: 9841234567, totalMinor: 9712345678 },
      // Digits inside ids and hashes are not phone numbers.
      product_id: '0195f3a0-9812-3456-7890-981234567890',
      hash: '9812345678abcdef9812345678abcdef9812345678abcdef9812345678abcdef',
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

  test('a mobile number is masked in {label}')
    .with([
      { label: 'hyphenated', text: 'call 98-1234-5678 now' },
      { label: 'with spaces', text: 'call 98 1234 5678 now' },
      { label: 'with the country code', text: 'call +977 981 2345678 now' },
      { label: '00977', text: 'call 00977-9812345678 now' },
      { label: 'Devanagari digits', text: 'call ९८१२३४५६७८ now' },
      { label: 'Devanagari with the country code', text: 'call +९७७ ९८१२३४५६७८ now' },
    ])
    .run(({ assert }, { text }) => {
      assert.equal(maskPersonalText(text), 'call [phone] now')
    })

  test('ids are not personal; raw emails and phone numbers are', ({ assert }) => {
    assert.isFalse(isPersonalIdentifier('0195f3a0-9812-3456-7890-981234567890'))
    assert.isFalse(isPersonalIdentifier('9812345678abcdef'.repeat(4)))
    assert.isFalse(isPersonalIdentifier('shop:0195f3a0-0000-7000-8000-000000000001:owner'))
    assert.isTrue(isPersonalIdentifier('sita@example.com'))
    assert.isTrue(isPersonalIdentifier('9812345678'))
  })

  test('a 100,000-character string is scanned in linear time', ({ assert }) => {
    for (const text of [
      'a'.repeat(100_000),
      `a@${'a'.repeat(100_000)}`,
      `${'a'.repeat(100_000)}@`,
      'a@'.repeat(50_000),
      '9'.repeat(100_000),
    ]) {
      const started = performance.now()
      looksPersonal(text)
      maskPersonalText(text)
      assert.isBelow(performance.now() - started, 250, `${text.slice(0, 4)}…`)
    }
  })
})
