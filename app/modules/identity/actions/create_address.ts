import { ADDRESS_LIMITS } from '#shared/constants/limits'
import {
  checkPlace,
  clearDefault,
  invalid,
  lockAddressOwner,
  sealedAddress,
  type AddressPlace,
} from '#modules/identity/internal/address_book'
import { withTx } from '#modules/platform/tx'

/*
 * `createAddress` (docs/06 §13.4; 01 FR-IAM-012; 04a §5.5), the identity
 * entry action for the signed-in user, `pending_verification` included
 * (docs/07 §4.4: `/account` self-service).
 *
 * The members are already checked by the validator: the name, area and
 * landmark trimmed and in NFC, the phone in E.164 (`nepalMobile`), the codes
 * well formed. They are encrypted before the transaction (`sealedAddress`).
 * In one transaction:
 * 1. the user's row is locked and the session checked (`lockAddressOwner`);
 * 2. the place is checked against the reference data (`checkPlace`);
 * 3. a user who already has 10 active addresses [Assumption,
 *    AC-FR-IAM-012-4] gets 422 `VALIDATION_FAILED` with the form-level
 *    reason `address_limit`; the lock makes the count exact under
 *    concurrency (T-IAM-107);
 * 4. the user's first active address is the default whatever `is_default`
 *    says; otherwise `is_default: true` clears the old default first, then
 *    inserts the new one as the default (INV-17, the order of docs/04 §16.3).
 *
 * No audit row: docs/04a §15.3 lists no address action, and the row could
 * hold nothing about the address anyway. Not ⚷ (06 §7.7): a repeat adds a
 * second address, which the user can remove. Returns the new address's ID.
 */

export type CreateAddressCommand = {
  label: string | null
  recipientName: string
  recipientPhoneE164: string
  place: AddressPlace
  areaTole: string
  streetLandmark: string | null
  isDefault: boolean
  // The `security_stamp` the acting session holds, which the account check has just compared.
  sessionStamp: string
}

export async function createAddress(userId: string, command: CreateAddressCommand) {
  const columns = sealedAddress({
    label: command.label,
    recipientName: command.recipientName,
    recipientPhoneE164: command.recipientPhoneE164,
    place: command.place,
    areaTole: command.areaTole,
    streetLandmark: command.streetLandmark,
  })

  return withTx(async (trx) => {
    await lockAddressOwner(trx, userId, command.sessionStamp)
    await checkPlace(trx, command.place)

    const active = await trx
      .from('user_addresses')
      .where('user_id', userId)
      .whereNull('archived_at')
      .select('id')
    if (active.length >= ADDRESS_LIMITS.maxActive) {
      throw invalid(
        null,
        'address_limit',
        `You can keep up to ${ADDRESS_LIMITS.maxActive} addresses. Remove one to add another.`
      )
    }

    // The first active address is the default (04a §5.5); another becomes it only when asked.
    const isDefault = active.length === 0 || command.isDefault
    if (isDefault && active.length > 0) await clearDefault(trx, userId)
    const [row] = await trx
      .table('user_addresses')
      .insert({ user_id: userId, is_default: isDefault, ...columns })
      .returning('id')
    return row.id as string
  })
}
