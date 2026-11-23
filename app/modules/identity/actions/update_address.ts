import { DomainError } from '#exceptions/domain_error'
import {
  checkPlace,
  clearDefault,
  invalid,
  lockAddressOwner,
  sealedAddress,
  type AddressPlace,
} from '#modules/identity/internal/address_book'
import { ownAddress } from '#modules/identity/queries'
import { withTx } from '#modules/platform/tx'

/*
 * `updateAddress` (docs/06 §13.4; 01 FR-IAM-012; 04a §5.5), the identity
 * entry action for the signed-in user. Every member is optional; one that
 * is absent keeps its column, `label: null` and `street_landmark: null`
 * clear those two, and an empty body changes nothing.
 *
 * - The place: the members sent are laid over the saved ones and the result
 *   is checked as one chain with its ward (`checkPlace`), so a ward alone is
 *   checked against the saved local level, and a district without its local
 *   level is refused with `location_mismatch`. Without any place member the
 *   saved place is kept as it is, even a unit made inactive since (04a §9
 *   "Changes": saved addresses stay valid).
 * - `is_default: true` on another address clears the old default, then sets
 *   this one (INV-17, docs/04 §16.3); `false` on the current default is 422
 *   `default_required` on `is_default`: the default moves only when another
 *   address is made the default (04a §5.5); `false` on any other address
 *   changes nothing.
 *
 * In one transaction the user's row is locked and the session checked
 * (`lockAddressOwner`), then the address is loaded with its owner and
 * `archived_at IS NULL` in the query: another user's, an archived or a
 * missing address is 404 `NOT_FOUND` alike (T-SEC-006, docs/07 §4.6). The
 * write repeats both conditions. Past orders keep their snapshot (04a §5.5).
 * No audit row (04a §15.3 lists no address action); not ⟳ (`user_addresses`
 * has no `version`, 06 §8) and not ⚷ (a repeat sets the same values).
 */

export type UpdateAddressCommand = {
  label?: string | null
  recipientName?: string
  recipientPhoneE164?: string
  place?: Partial<AddressPlace>
  areaTole?: string
  streetLandmark?: string | null
  isDefault?: boolean
  sessionStamp: string
}

const PLACE_KEYS = ['provinceCode', 'districtCode', 'localLevelCode', 'wardNo'] as const

export async function updateAddress(
  userId: string,
  addressId: string,
  command: UpdateAddressCommand
): Promise<void> {
  const sent = command.place ?? {}
  const placeSent = PLACE_KEYS.some((key) => sent[key] !== undefined)
  const fields = {
    label: command.label,
    recipientName: command.recipientName,
    recipientPhoneE164: command.recipientPhoneE164,
    areaTole: command.areaTole,
    streetLandmark: command.streetLandmark,
  }

  await withTx(async (trx) => {
    await lockAddressOwner(trx, userId, command.sessionStamp)
    const saved = await ownAddress(userId, addressId, { client: trx })
    if (!saved) throw new DomainError('NOT_FOUND')

    if (command.isDefault === false && saved.is_default) {
      throw invalid('is_default', 'default_required', 'Make another address the default instead.')
    }

    let place: AddressPlace | undefined
    if (placeSent) {
      place = {
        provinceCode: sent.provinceCode ?? saved.province_code,
        districtCode: sent.districtCode ?? saved.district_code,
        localLevelCode: sent.localLevelCode ?? saved.local_level_code,
        wardNo: sent.wardNo ?? saved.ward_no,
      }
      await checkPlace(trx, place)
    }

    const values = sealedAddress({ ...fields, place })
    const makeDefault = command.isDefault === true && !saved.is_default
    if (makeDefault) {
      await clearDefault(trx, userId)
      values.is_default = true
    }
    if (Object.keys(values).length === 0) return

    const updated: { id: string }[] = await trx
      .from('user_addresses')
      .where({ id: addressId, user_id: userId })
      .whereNull('archived_at')
      .update(values, ['id'])
    // The user's row is locked and the address was read active under it, so this cannot miss.
    if (updated.length === 0) throw new DomainError('NOT_FOUND')
  })
}
