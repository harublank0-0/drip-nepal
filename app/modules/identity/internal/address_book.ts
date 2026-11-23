import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import { DomainError } from '#exceptions/domain_error'
import { ACCOUNT_SUSPENDED_DETAIL } from '#shared/constants/auth'
import { maySignIn } from '#modules/identity/domain/user_status'
import { activeLocalLevelChain } from '#modules/logistics/queries'
import { encryptField } from '#modules/platform/crypto/field_encrypter'

/*
 * What the three address-book writes share (docs/04a §5.5, docs/04 §16.3
 * INV-17; 06 §13.4 `createAddress`, `updateAddress`, `deleteAddress`).
 *
 * - `lockAddressOwner`: every write starts by locking the user's row
 *   `FOR NO KEY UPDATE` (level 0 of docs/05 §4.4, and no level 1–8 lock
 *   after it), so one user's address writes queue: two "make default"
 *   requests, two first addresses and the 10-address count never interleave.
 *   Under the lock it also reads what the account check of docs/07 §3.3
 *   compared: a suspension, a deletion request or a stamp rotation that
 *   committed after the check wins, 403 `ACCOUNT_SUSPENDED` if the status
 *   changed, else 401 `UNAUTHENTICATED`, and nothing is written.
 * - `checkPlace`: the province, district and local level must be one active
 *   chain (422 `location_mismatch` on `local_level_code`) and the ward within
 *   the local level's `ward_count` (422 `ward_out_of_range` on `ward_no`),
 *   before the insert, so the composite foreign keys are only a backstop
 *   (T-IAM-108, AC-FR-IAM-012-1, -2). The chain is read through the
 *   `logistics` queries, which own the location tables (docs/09 §2.2).
 * - `sealedAddress`: the recipient name, the phone, the area and the
 *   landmark encrypted with the AAD `user_addresses.<column>`, and the
 *   phone's last four digits for lists (docs/04 §2.9, AC-FR-IAM-012-5). The
 *   phone is checked by the account phone's rule (`nepalMobile`) and stored
 *   in E.164. `user_addresses` has no blind-index column (docs/04a §5.5), so
 *   none is written: the blind index of 04 §2.9 is `users.phone_hash`.
 */

export type AddressPlace = {
  provinceCode: string
  districtCode: string
  localLevelCode: string
  wardNo: number
}

// The members a write may set; `undefined` keeps a column, `null` clears an optional one.
export type AddressFields = {
  label?: string | null
  recipientName?: string
  // E.164 from the Nepali mobile rule.
  recipientPhoneE164?: string
  place?: AddressPlace
  areaTole?: string
  streetLandmark?: string | null
}

const aad = (column: string) => `user_addresses.${column}`

export function invalid(field: string | null, code: string, message: string) {
  return new DomainError('VALIDATION_FAILED', {
    detail: 'Some fields need attention.',
    errors: [{ field, code, message }],
  })
}

function staleSession(status: string | undefined) {
  if (status !== undefined && !maySignIn(status)) {
    return new DomainError('ACCOUNT_SUSPENDED', { detail: ACCOUNT_SUSPENDED_DETAIL })
  }
  return new DomainError('UNAUTHENTICATED', { detail: 'Please log in to continue.' })
}

export async function lockAddressOwner(
  trx: TransactionClientContract,
  userId: string,
  sessionStamp: string
) {
  const locked = await trx.rawQuery(
    'SELECT status, security_stamp FROM users WHERE id = ? FOR NO KEY UPDATE',
    [userId]
  )
  const user: { status: string; security_stamp: string } | undefined = locked.rows[0]
  if (!user || !maySignIn(user.status) || String(user.security_stamp) !== sessionStamp) {
    throw staleSession(user?.status)
  }
}

export async function checkPlace(trx: TransactionClientContract, place: AddressPlace) {
  const chain = await activeLocalLevelChain(place.localLevelCode, { client: trx })
  if (
    !chain ||
    chain.districtCode !== place.districtCode ||
    chain.provinceCode !== place.provinceCode
  ) {
    throw invalid(
      'local_level_code',
      'location_mismatch',
      'The province, district and local level do not match.'
    )
  }
  if (place.wardNo < 1 || place.wardNo > chain.wardCount) {
    throw invalid('ward_no', 'ward_out_of_range', 'This local level has no such ward.')
  }
}

// The columns of `fields` that are set, encrypted where the column is `_enc`.
export function sealedAddress(fields: AddressFields): Record<string, unknown> {
  const columns: Record<string, unknown> = {}
  if (fields.label !== undefined) columns.label = fields.label
  if (fields.recipientName !== undefined) {
    columns.recipient_name_enc = encryptField(fields.recipientName, aad('recipient_name_enc'))
  }
  if (fields.recipientPhoneE164 !== undefined) {
    columns.recipient_phone_enc = encryptField(
      fields.recipientPhoneE164,
      aad('recipient_phone_enc')
    )
    columns.recipient_phone_last4 = fields.recipientPhoneE164.slice(-4)
  }
  if (fields.place) {
    columns.province_code = fields.place.provinceCode
    columns.district_code = fields.place.districtCode
    columns.local_level_code = fields.place.localLevelCode
    columns.ward_no = fields.place.wardNo
  }
  if (fields.areaTole !== undefined) {
    columns.area_tole_enc = encryptField(fields.areaTole, aad('area_tole_enc'))
  }
  if (fields.streetLandmark !== undefined) {
    columns.street_landmark_enc =
      fields.streetLandmark === null
        ? null
        : encryptField(fields.streetLandmark, aad('street_landmark_enc'))
  }
  return columns
}

// Clears the user's default, the first half of "make default" (docs/04 §16.3 INV-17).
export async function clearDefault(trx: TransactionClientContract, userId: string) {
  await trx
    .from('user_addresses')
    .where({ user_id: userId, is_default: true })
    .whereNull('archived_at')
    .update({ is_default: false })
}
