import { test } from '@japa/runner'
import app from '@adonisjs/core/services/app'
import db from '@adonisjs/lucid/services/db'
import PlatformCreateShop, {
  BUSINESS_TYPE_PROMPT,
  GRIEVANCE_NAME_PROMPT,
  GRIEVANCE_PHONE_PROMPT,
  RETURN_POLICY_PROMPT,
} from '../../../commands/platform_create_shop.js'
import { UserFactory } from '#database/factories/user_factory'
import { decryptField } from '#modules/platform/crypto/field_decrypter'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'
import { createOwnerShop } from '#tests/support/shops'

/*
 * `node ace platform:create-shop` (docs/09 §9.8; docs/12 §9 part 1a):
 * - T-SHOP-007: for an active owner who owns no shop, the command creates
 *   one `active` shop with `approved_at` and `approved_by` (the owner), a
 *   zero commission (A-62), the grievance phone encrypted, one
 *   `shop_agreements` row for the current version with the host's zero
 *   `ip_hash` and the run's ID, no membership row, and one `shop.bootstrap`
 *   audit row by the system carrying the same run ID; the output names the
 *   owner masked and the run. It exits 1 and writes nothing for an unknown
 *   or inactive owner, an owner who already owns a shop (a second run), a
 *   slug another shop holds or held, a reserved or malformed slug, a
 *   registered business without its identifiers, and a missing value it
 *   cannot ask for without a terminal; the owner checks come before any
 *   prompt; the grievance name and phone have no flag.
 *   The concurrent case is in tests/concurrency/shops/platform_create_shop.spec.ts.
 * - T-SEC-102: the audit row's `changes` holds no fixture personal value.
 *
 * Each test runs in the functional suite's global transaction, so the
 * command's transaction is rolled back afterwards.
 */

const GRIEVANCE_NAME = 'Synthetic Grievance Officer'
const GRIEVANCE_PHONE = '9800000042'

type Answers = (command: PlatformCreateShop) => void

let sequence = 0
function flagsFor(ownerEmail: string, overrides: Record<string, string | null> = {}) {
  sequence += 1
  const values: Record<string, string | null> = {
    'owner': ownerEmail,
    'slug': `drip-owner-${Date.now().toString(36)}-${sequence}`,
    'name': 'Drip Owner Shop',
    'contact-email': `Shop.Contact.${sequence}@Example.com`,
    'contact-phone': '01-4123456',
    'business-type': 'individual',
    'return-policy': 'Returns within 7 days, unworn and with tags.',
    ...overrides,
  }
  return Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([flag, value]) => `--${flag}=${value}`)
}

// The grievance name and phone are always asked; tests answer them unless they say otherwise.
const answerGrievance =
  (name = GRIEVANCE_NAME): Answers =>
  (command) => {
    command.prompt.trap(GRIEVANCE_NAME_PROMPT).replyWith(name)
    command.prompt.trap(GRIEVANCE_PHONE_PROMPT).replyWith(GRIEVANCE_PHONE)
  }

async function createShop(argv: string[], answers: Answers | null = answerGrievance()) {
  const ace = await app.container.make('ace')
  ace.ui.switchMode('raw')
  const command = await ace.create(PlatformCreateShop, argv)
  // As in a release container: only prompts a test answers can be asked.
  command.interactiveTerminal = false
  answers?.(command)
  await command.exec()
  return command
}

const logsOf = (command: PlatformCreateShop) => command.logger.getLogs().map((log) => log.message)

const slugOf = (argv: string[]) => argv.find((flag) => flag.startsWith('--slug='))!.slice(7)

async function activeOwner() {
  const owner = await UserFactory.create()
  return { id: owner.id, email: owner.email }
}

// Row counts of every table the command writes.
async function counts() {
  const result = await db.rawQuery(
    `SELECT (SELECT count(*)::int FROM shops) AS shops,
            (SELECT count(*)::int FROM shop_agreements) AS agreements,
            (SELECT count(*)::int FROM shop_memberships) AS memberships,
            (SELECT count(*)::int FROM audit_logs) AS audits`
  )
  return result.rows[0] as Record<string, number>
}

test.group('T-SHOP-007 platform:create-shop', () => {
  test('T-SHOP-007 creates the owner’s active shop, its agreement row and one audit row', async ({
    assert,
  }) => {
    const owner = await activeOwner()
    const before = await counts()
    const argv = flagsFor(owner.email)
    const command = await createShop(argv)

    command.assertSucceeded()
    const shop = await db.from('shops').where('slug', slugOf(argv)).firstOrFail()
    assert.equal(shop.owner_user_id, owner.id)
    assert.equal(shop.status, 'active')
    assert.equal(shop.approved_by, owner.id)
    assert.isNotNull(shop.approved_at)
    assert.equal(shop.commission_rate_bp, 0, 'A-62')
    assert.equal(
      shop.product_review_mode,
      'post',
      'its products are published directly (R1-S part 2e-ii)'
    )
    assert.equal(shop.name, 'Drip Owner Shop')
    assert.match(shop.contact_email, /^shop\.contact\.\d+@example\.com$/)
    assert.equal(shop.contact_phone_e164, '+97714123456')
    assert.equal(shop.business_type, 'individual')
    assert.isFalse(shop.is_vat_registered)
    assert.equal(shop.grievance_contact_name, GRIEVANCE_NAME)
    assert.notInclude(shop.grievance_contact_phone_enc, GRIEVANCE_PHONE)
    assert.equal(
      decryptField(shop.grievance_contact_phone_enc, 'shops.grievance_contact_phone_enc'),
      `+977${GRIEVANCE_PHONE}`
    )

    const agreements = await db.from('shop_agreements').where('shop_id', shop.id)
    assert.lengthOf(agreements, 1)
    assert.equal(agreements[0].agreement_version, CURRENT_SELLER_AGREEMENT.version)
    assert.equal(agreements[0].accepted_by_user_id, owner.id)
    assert.isTrue(Buffer.from(agreements[0].ip_hash).equals(Buffer.alloc(32)), 'no client address')
    const runId = agreements[0].request_id as string

    // The owner is `shops.owner_user_id`, never a membership row (04a §6.2).
    assert.isNull(await db.from('shop_memberships').where('shop_id', shop.id).first())

    const audits = await db.from('audit_logs').where('shop_id', shop.id)
    assert.lengthOf(audits, 1)
    assert.equal(audits[0].action, 'shop.bootstrap')
    assert.equal(audits[0].actor_type, 'system')
    assert.isNull(audits[0].actor_user_id)
    assert.isNull(audits[0].ip_hash)
    assert.equal(audits[0].subject_type, 'shop')
    assert.equal(audits[0].subject_id, shop.id)
    assert.equal(audits[0].request_id, runId)
    assert.deepEqual(audits[0].changes, {
      source: 'host_command',
      status: { from: null, to: 'active' },
      owner_user_id: owner.id,
      approved_by: owner.id,
      agreement_version: CURRENT_SELLER_AGREEMENT.version,
      commission_rate_bp: 0,
      business_type: 'individual',
      changed: ['grievance_contact_name', 'grievance_contact_phone_enc'],
    })

    const after = await counts()
    assert.deepEqual(after, {
      shops: before.shops + 1,
      agreements: before.agreements + 1,
      memberships: before.memberships,
      audits: before.audits + 1,
    })

    const output = logsOf(command).join('\n')
    assert.include(output, `run ${runId}`)
    assert.include(output, `${owner.email[0]}•••@example.com`)
    assert.notInclude(output, owner.email)
    assert.notInclude(output, GRIEVANCE_PHONE)
  })

  test('T-SEC-102 the shop.bootstrap row holds no fixture personal value', async ({ assert }) => {
    const owner = await activeOwner()
    const argv = flagsFor(owner.email)
    const command = await createShop(argv, answerGrievance('Maya Fixture Gurung'))
    command.assertSucceeded()
    const shop = await db.from('shops').where('slug', slugOf(argv)).firstOrFail()
    const audit = await db.from('audit_logs').where('shop_id', shop.id).firstOrFail()
    const written = JSON.stringify(audit.changes) + (audit.reason ?? '')
    for (const value of [owner.email, 'Maya Fixture Gurung', GRIEVANCE_PHONE, shop.contact_email]) {
      assert.notInclude(written, value)
    }
  })

  test('T-SHOP-007 a registered business keeps its identifiers and VAT flag', async ({
    assert,
  }) => {
    const owner = await activeOwner()
    const argv = [
      ...flagsFor(owner.email, { 'business-type': 'registered_business' }),
      '--registration-number=12345/079/080',
      '--registration-authority=Office of the Company Registrar',
      '--pan-vat-number=600123456',
      '--vat-registered',
    ]
    const command = await createShop(argv)
    command.assertSucceeded()
    const shop = await db.from('shops').where('slug', slugOf(argv)).firstOrFail()
    assert.equal(shop.business_type, 'registered_business')
    assert.equal(shop.business_registration_number, '12345/079/080')
    assert.equal(shop.business_registration_authority, 'Office of the Company Registrar')
    assert.equal(shop.pan_vat_number, '600123456')
    assert.isTrue(shop.is_vat_registered)
  })

  test('T-SHOP-007 a value left out is asked for at a prompt', async ({ assert }) => {
    const owner = await activeOwner()
    const argv = flagsFor(owner.email, { 'business-type': null, 'return-policy': null })
    const command = await createShop(argv, (cmd) => {
      answerGrievance()(cmd)
      cmd.prompt.trap(BUSINESS_TYPE_PROMPT).replyWith('individual')
      cmd.prompt.trap(RETURN_POLICY_PROMPT).replyWith('Exchanges within 7 days.')
    })
    command.assertSucceeded()
    const shop = await db.from('shops').where('slug', slugOf(argv)).firstOrFail()
    assert.equal(shop.return_policy_text, 'Exchanges within 7 days.')
  })

  test('T-SHOP-007 a second run for the same owner exits 1 and changes nothing', async ({
    assert,
  }) => {
    const owner = await activeOwner()
    const first = await createShop(flagsFor(owner.email))
    first.assertSucceeded()
    const before = await counts()

    // Refused before any prompt: none is answered.
    const second = await createShop(flagsFor(owner.email), null)
    second.assertFailed()
    assert.include(logsOf(second).join('\n'), 'already owns a shop; nothing changed')
    assert.deepEqual(await counts(), before)
  })

  test('T-SHOP-007 an owner that is unknown or not active is refused: {label}')
    .with([
      { label: 'no account', state: null },
      { label: 'pending_verification', state: 'pending_verification' as const },
      { label: 'suspended', state: 'suspended' as const },
      { label: 'deactivated', state: 'deactivated' as const },
    ])
    .run(async ({ assert }, { state }) => {
      const user = state ? await UserFactory.apply(state).create() : null
      const email = user ? user.email : `nobody-${Date.now()}@example.com`
      const before = await counts()
      // Refused before any prompt: none is answered.
      const command = await createShop(flagsFor(email), null)
      command.assertFailed()
      assert.match(logsOf(command).join('\n'), state ? new RegExp(state) : /signs up first/)
      assert.deepEqual(await counts(), before)
    })

  test('T-SHOP-007 a slug another shop holds, or held, is refused', async ({ assert }) => {
    const other = await createOwnerShop()
    const retired = `retired-${Date.now().toString(36)}`
    await db
      .table('slug_redirects')
      .insert({ entity_type: 'shop', old_slug: retired, entity_id: other.shopId })
    for (const slug of [other.slug, other.slug.toUpperCase(), retired]) {
      const owner = await activeOwner()
      const before = await counts()
      const command = await createShop(flagsFor(owner.email, { slug }))
      command.assertFailed()
      assert.include(logsOf(command).join('\n'), 'Another shop holds this slug', slug)
      assert.deepEqual(await counts(), before, slug)
    }
  })

  test('T-SHOP-007 a reserved or malformed slug is refused before any prompt: {slug}')
    .with([
      { slug: 'seller' },
      { slug: 'Admin' },
      { slug: 'ab' },
      { slug: '-shop' },
      { slug: 'a b c' },
    ])
    .run(async ({ assert }, { slug }) => {
      const owner = await activeOwner()
      const before = await counts()
      // No prompt is answered: the slug is refused before the command asks anything.
      const command = await createShop(flagsFor(owner.email, { slug }), null)
      command.assertFailed()
      assert.match(logsOf(command).join('\n'), /slug: /)
      assert.deepEqual(await counts(), before)
    })

  test('T-SHOP-007 a registered business without its identifiers is refused', async ({
    assert,
  }) => {
    const owner = await activeOwner()
    const before = await counts()
    const command = await createShop(
      flagsFor(owner.email, { 'business-type': 'registered_business' })
    )
    command.assertFailed()
    const output = logsOf(command).join('\n')
    for (const field of [
      'business_registration_number',
      'business_registration_authority',
      'pan_vat_number',
    ]) {
      assert.include(output, `${field}: `)
    }
    assert.deepEqual(await counts(), before)
  })

  test('T-SHOP-007 without a terminal, a value it must ask for stops the command', async ({
    assert,
  }) => {
    const owner = await activeOwner()
    const before = await counts()
    const command = await createShop(flagsFor(owner.email), null)
    command.assertFailed()
    assert.include(
      logsOf(command).join('\n'),
      `"${GRIEVANCE_NAME_PROMPT}" needs an interactive terminal`
    )
    assert.deepEqual(await counts(), before)
  })

  test('T-SHOP-007 the grievance name and phone have no flag, so they never reach shell history', ({
    assert,
  }) => {
    const names = PlatformCreateShop.flags.map((flag) => flag.flagName)
    assert.sameMembers(names, [
      'owner',
      'slug',
      'name',
      'contact-email',
      'contact-phone',
      'business-type',
      'registration-number',
      'registration-authority',
      'pan-vat-number',
      'vat-registered',
      'return-policy',
    ])
    assert.isEmpty(PlatformCreateShop.args)
  })
})
