import { DomainError } from '#exceptions/domain_error'
import { lockAddressOwner } from '#modules/identity/internal/address_book'
import { ownAddress } from '#modules/identity/queries'
import { withTx } from '#modules/platform/tx'

/*
 * `deleteAddress` (docs/06 §13.4; 01 AC-FR-IAM-012-4; 04a §5.5), the
 * identity entry action for the signed-in user. It archives, never deletes:
 * `archived_at` is set and the row leaves every list and checkout; the daily
 * `platform.retention_purge` job (not built yet) hard-deletes it after 30
 * days [Assumption, 04 §19.3]. Past orders keep their snapshot.
 *
 * In one transaction the user's row is locked and the session checked
 * (`lockAddressOwner`), then the address is loaded with its owner and
 * `archived_at IS NULL` in the query: another user's, an archived or a
 * missing address is 404 `NOT_FOUND` alike (T-SEC-006). Archiving the
 * default clears `is_default` in the same update
 * (`user_addresses_default_not_archived_check`), then makes the most
 * recently created remaining active address the default, so a user with
 * an address always has exactly one default (INV-17, T-IAM-107). No audit
 * row (04a §15.3 lists no address action); not ⚷: a repeat finds nothing
 * and answers 404.
 */

export async function deleteAddress(
  userId: string,
  addressId: string,
  command: { sessionStamp: string }
): Promise<void> {
  await withTx(async (trx) => {
    await lockAddressOwner(trx, userId, command.sessionStamp)
    const saved = await ownAddress(userId, addressId, { client: trx })
    if (!saved) throw new DomainError('NOT_FOUND')

    const archived: { id: string }[] = await trx
      .from('user_addresses')
      .where({ id: addressId, user_id: userId })
      .whereNull('archived_at')
      .update({ is_default: false, archived_at: trx.knexRawQuery('now()') }, ['id'])
    // The user's row is locked and the address was read active under it, so this cannot miss.
    if (archived.length === 0) throw new DomainError('NOT_FOUND')
    if (!saved.is_default) return

    const next = await trx
      .from('user_addresses')
      .where('user_id', userId)
      .whereNull('archived_at')
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc')
      .select('id')
      .first()
    if (next) {
      await trx
        .from('user_addresses')
        .where({ id: next.id, user_id: userId })
        .whereNull('archived_at')
        .update({ is_default: true })
    }
  })
}
