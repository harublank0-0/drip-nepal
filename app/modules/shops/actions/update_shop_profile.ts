import { DomainError, VersionConflict, type ProblemErrorItem } from '#exceptions/domain_error'
import { InvariantViolation } from '#exceptions/programming_errors'
import { recordAudit } from '#modules/audit/actions/record_audit'
import type { Actor } from '#modules/platform/actor'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { withTx } from '#modules/platform/tx'
import type { BusinessType } from '#modules/shops/domain/business_type'
import { shopGateAllows } from '#modules/shops/permissions'
import { sellerShop, type SellerContext, type SellerShopRow } from '#modules/shops/queries'

/*
 * `updateShopProfile` (docs/06 §13.5, §8; 01 FR-SHOP-003, AC-FR-SHOP-013-2;
 * R1-S part 1b), the shops entry action. Identity-free: the caller's place
 * in the shop comes from `seller_context` (`command.shop`), and the
 * controller has already checked `shop.profile.manage`, the status gate and
 * that only the owner sends the owner-only members (07 §4.3, §4.5).
 *
 * Every change is optional; one that is absent keeps its column. The
 * description may be null, which clears it; so may the registration number,
 * the registering authority and the PAN/VAT number, within the rules below.
 *
 * The `shop_profile_update` limiter (20 per hour per user, proposed,
 * docs/06 §9.1) has already taken its point in the API limits middleware,
 * before every check, because each change writes an audit row to the
 * insert-only `audit_logs`, kept 7 years. The grievance phone is encrypted
 * before the transaction (AAD `shops.grievance_contact_phone_enc`, docs/04
 * §2.9); it has no blind index (04a §6.1).
 *
 * In one transaction:
 * 1. The shop row is locked `FOR NO KEY UPDATE` (level 0 of docs/05 §4.4)
 *    and read.
 * 2. The status gate again, on the locked row: a suspension or closure that
 *    committed after `seller_context` read the shop wins, with 403
 *    `SHOP_NOT_ACTIVE` (07 §4.4 "profile, shipping").
 * 3. ⟳: the locked `version` must equal the `If-Match` version, else 412
 *    `VERSION_CONFLICT` with `current`, the shop as `getSellerShop` shows it
 *    to this caller (06 §8). Nothing is written.
 * 4. The business rules of 04a §6.1 on the result, the saved values with
 *    the changes laid over them: a `registered_business` needs its
 *    registration number, registering authority and PAN/VAT number
 *    (`shops_registered_business_check`), and a VAT-registered shop its
 *    PAN/VAT number (`shops_vat_requires_pan_check`); else 422 `required`
 *    on the missing member. An individual's PAN is neither required nor
 *    refused while OD-16 and VX-05 are open.
 * 5. Only the columns that differ are written (the grievance phone, which
 *    this action may not decrypt, counts as changed whenever it is sent),
 *    with `version + 1`, by compare-and-set on the version and the status
 *    the lock read. A request that changes nothing writes nothing and keeps
 *    the version.
 * 6. One `shop.profile_update` audit row (proposed, docs/04a §15.3) names
 *    the changed columns in `changed` and records the from and to values of
 *    `business_type` and `is_vat_registered` only. Every other column goes
 *    by name: the grievance contact and an individual's identifiers are
 *    personal, and the writer refuses any string holding an email address
 *    or a mobile number, which the shop's own contact and the free-text
 *    description and return policy may hold (T-SEC-102).
 *
 * The shop name is not a member (AC-FR-SHOP-003-1), so no listing refresh
 * follows (`catalog.refresh_listing` does not exist yet either). A shop the
 * retention redaction has cleared (`personal_data_redacted_at`, 04a §6.1) is
 * `closed` or `rejected`; the retention purge is not built, and its
 * `shops_grievance_contact_check` stays the backstop until it is.
 * Verified by T-SHOP-009, T-API-004, T-SEC-031 and T-SEC-102.
 */

export type ShopProfileChanges = {
  description?: string | null
  contactEmail?: string
  contactPhoneE164?: string
  returnPolicyText?: string
  businessType?: BusinessType
  registrationNumber?: string | null
  registrationAuthority?: string | null
  panVatNumber?: string | null
  isVatRegistered?: boolean
  grievanceContactName?: string
  grievanceContactPhoneE164?: string
}

export type UpdateShopProfileCommand = {
  // The shop `seller_context` resolved, with the caller's place in it.
  shop: SellerContext
  // From `If-Match`; -1 for a tag that names no version (06 §8).
  expectedVersion: number
  changes: ShopProfileChanges
}

type LockedShop = {
  status: string
  suspension_mode: string | null
  version: number
  description: string | null
  contact_email: string
  contact_phone_e164: string
  return_policy_text: string
  business_type: BusinessType
  business_registration_number: string | null
  business_registration_authority: string | null
  pan_vat_number: string | null
  is_vat_registered: boolean
  grievance_contact_name: string | null
}

// Each plaintext change and its column, in the order of docs/04a §6.1.
const COLUMNS = [
  ['description', 'description'],
  ['contactEmail', 'contact_email'],
  ['contactPhoneE164', 'contact_phone_e164'],
  ['returnPolicyText', 'return_policy_text'],
  ['businessType', 'business_type'],
  ['registrationNumber', 'business_registration_number'],
  ['registrationAuthority', 'business_registration_authority'],
  ['panVatNumber', 'pan_vat_number'],
  ['isVatRegistered', 'is_vat_registered'],
  ['grievanceContactName', 'grievance_contact_name'],
] as const satisfies readonly (readonly [keyof ShopProfileChanges, keyof LockedShop])[]

type Column = (typeof COLUMNS)[number][1]

function required(field: string, message: string): ProblemErrorItem {
  return { field, code: 'required', message }
}

// The 04a §6.1 CHECKs the business details must meet together, on the row as it would be saved.
function businessRuleErrors(after: <C extends Column>(column: C) => LockedShop[C]) {
  const errors: ProblemErrorItem[] = []
  const pan = after('pan_vat_number')
  if (after('business_type') === 'registered_business') {
    if (after('business_registration_number') === null) {
      errors.push(
        required('registration_number', 'A registered business needs its registration number.')
      )
    }
    if (after('business_registration_authority') === null) {
      errors.push(
        required('registration_authority', 'A registered business needs its registering authority.')
      )
    }
    if (pan === null) {
      errors.push(required('pan_vat_number', 'A registered business needs its PAN/VAT number.'))
    }
  }
  if (
    after('is_vat_registered') &&
    pan === null &&
    errors.every((e) => e.field !== 'pan_vat_number')
  ) {
    errors.push(required('pan_vat_number', 'A VAT-registered shop needs its PAN/VAT number.'))
  }
  return errors
}

export async function updateShopProfile<T extends Record<string, unknown>>(
  command: UpdateShopProfileCommand,
  context: { actor: Actor; present: (row: SellerShopRow) => T }
): Promise<T> {
  const { shop, changes } = command
  const { actor } = context
  if (!actor.userId) throw new InvariantViolation('updateShopProfile needs the acting user')
  const grievancePhoneEnc =
    changes.grievanceContactPhoneE164 === undefined
      ? null
      : encryptField(changes.grievanceContactPhoneE164, 'shops.grievance_contact_phone_enc')

  return withTx(async (trx) => {
    const locked = await trx.rawQuery(
      `SELECT status, suspension_mode, version, description, contact_email, contact_phone_e164,
              return_policy_text, business_type, business_registration_number,
              business_registration_authority, pan_vat_number, is_vat_registered,
              grievance_contact_name
         FROM shops WHERE id = ? FOR NO KEY UPDATE`,
      [shop.id]
    )
    const row: LockedShop | undefined = locked.rows[0]
    // `seller_context` has just found the shop, and shops are never deleted while members remain.
    if (!row) throw new DomainError('NOT_FOUND')

    const lockedShop = { ...shop, status: row.status, suspensionMode: row.suspension_mode }
    if (!shopGateAllows(lockedShop, 'profile')) {
      throw new DomainError('SHOP_NOT_ACTIVE', {
        extensions: { shop_status: row.status, suspension_mode: row.suspension_mode },
      })
    }

    const present = async () => {
      const current = await sellerShop(shop.id, { client: trx })
      if (!current) throw new InvariantViolation('the locked shop could not be read')
      return context.present(current)
    }
    if (row.version !== command.expectedVersion) throw new VersionConflict(await present())

    const values: Record<string, unknown> = {}
    for (const [change, column] of COLUMNS) {
      const value = changes[change]
      if (value !== undefined && value !== row[column]) values[column] = value
    }
    const after = <C extends Column>(column: C): LockedShop[C] =>
      column in values ? (values[column] as LockedShop[C]) : row[column]
    const errors = businessRuleErrors(after)
    if (errors.length > 0) {
      throw new DomainError('VALIDATION_FAILED', { detail: 'Some fields need attention.', errors })
    }
    if (grievancePhoneEnc !== null) values.grievance_contact_phone_enc = grievancePhoneEnc
    if (Object.keys(values).length === 0) return present()

    const changed = Object.keys(values)
    const updated: { id: string }[] = await trx
      .from('shops')
      .where({ id: shop.id, version: row.version, status: row.status })
      .update(
        {
          ...values,
          version: trx.knexRawQuery('version + 1'),
          updated_at: trx.knexRawQuery('now()'),
        },
        ['id']
      )
    // The row is locked and was read with this version and status, so the update cannot miss.
    if (updated.length !== 1) throw new InvariantViolation('the locked shop was not updated')

    const audited: Record<string, { from: string | boolean; to: string | boolean }> = {}
    if ('business_type' in values) {
      audited.business_type = { from: row.business_type, to: after('business_type') }
    }
    if ('is_vat_registered' in values) {
      audited.is_vat_registered = { from: row.is_vat_registered, to: after('is_vat_registered') }
    }
    await recordAudit(trx, {
      actorType: actor.type,
      actorUserId: actor.userId,
      actorRole: actor.role,
      action: 'shop.profile_update',
      subjectType: 'shop',
      subjectId: shop.id,
      shopId: shop.id,
      requestId: actor.requestId,
      ipHash: actor.ipHash ?? null,
      changes: { changed, ...audited },
    })
    return present()
  })
}
