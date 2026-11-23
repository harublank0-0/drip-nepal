import type { HttpContext } from '@adonisjs/core/http'
import { DomainError } from '#exceptions/domain_error'
import { closedQuery } from '#controllers/support/cursor'
import { createAddress } from '#modules/identity/actions/create_address'
import { deleteAddress } from '#modules/identity/actions/delete_address'
import { updateAddress } from '#modules/identity/actions/update_address'
import { ownAddress, ownAddresses } from '#modules/identity/queries'
import { placeNames } from '#modules/logistics/queries'
import { addressJson } from '#transformers/identity/address_transformer'
import { assertKnownMembers, assertNotNull } from '#validators/support/strict_keys'
import {
  ADDRESS_MEMBERS,
  ADDRESS_NOT_NULL_MEMBERS,
  createAddressValidator,
  updateAddressValidator,
} from '#validators/identity/address'

/*
 * The signed-in user's address book (docs/06 §13.4; 01 FR-IAM-012; 04a
 * §5.5), behind `auth`; a `pending_verification` user may use it (docs/07
 * §4.4: `/account` self-service). Every address is looked up with the
 * caller's ID in the query, so another user's or an archived address
 * answers 404 exactly like a missing one (T-SEC-006, 07 §4.6). The writes
 * refuse any query parameter (the validator reads the body and the query
 * merged, so a member could otherwise arrive in the query, 06 §6.3) and
 * unknown members, validate, then call the identity action with the
 * stamp the account check has just compared (docs/07 §3.3). Each operation
 * is charged to `api_user` (06 §9.1). Routes in
 * start/routes/api_v1/customer.ts, named by their operationIds.
 *
 * - `listAddresses`: the active addresses, the default first, with the
 *   phone's last four digits only (06 §13.4); a bounded list (at most 10),
 *   so `{ data: [...] }` without `meta` or a cursor, and no query parameter
 *   (06 §6.2 "Bounded lists", §6.3).
 * - `createAddress`: 201 with the address, no `Location` (no read operation
 *   serves one address, 06 §3.7).
 * - `updateAddress`: 200 with the address after the change.
 * - `deleteAddress`: 204; the address is archived.
 */
export default class AddressesController {
  async listAddresses(ctx: HttpContext) {
    closedQuery(ctx, [])
    const rows = await ownAddresses(ctx.auth.getUserOrFail().id)
    const names = await placeNames(rows.map((row) => row.local_level_code))
    return { data: rows.map((row) => addressJson(row, names.get(row.local_level_code))) }
  }

  async createAddress(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertKnownMembers(ctx.request.body(), ADDRESS_MEMBERS)
    assertNotNull(ctx.request.body(), ['is_default'])
    const input = await ctx.request.validateUsing(createAddressValidator)
    const user = ctx.auth.getUserOrFail()
    const id = await createAddress(user.id, {
      label: input.label ?? null,
      recipientName: input.recipient_name,
      recipientPhoneE164: input.recipient_phone,
      place: {
        provinceCode: input.province_code,
        districtCode: input.district_code,
        localLevelCode: input.local_level_code,
        wardNo: input.ward_no,
      },
      areaTole: input.area_tole,
      streetLandmark: input.street_landmark ?? null,
      isDefault: input.is_default ?? false,
      sessionStamp: user.securityStamp,
    })
    return ctx.response.created({ data: await addressOf(user.id, id) })
  }

  async updateAddress(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertKnownMembers(ctx.request.body(), ADDRESS_MEMBERS)
    assertNotNull(ctx.request.body(), ADDRESS_NOT_NULL_MEMBERS)
    const input = await ctx.request.validateUsing(updateAddressValidator)
    const user = ctx.auth.getUserOrFail()
    const addressId: string = ctx.params.addressId
    await updateAddress(user.id, addressId, {
      label: input.label,
      recipientName: input.recipient_name,
      recipientPhoneE164: input.recipient_phone,
      place: {
        provinceCode: input.province_code,
        districtCode: input.district_code,
        localLevelCode: input.local_level_code,
        wardNo: input.ward_no,
      },
      areaTole: input.area_tole,
      streetLandmark: input.street_landmark,
      isDefault: input.is_default,
      sessionStamp: user.securityStamp,
    })
    return { data: await addressOf(user.id, addressId) }
  }

  async deleteAddress(ctx: HttpContext) {
    closedQuery(ctx, [])
    assertKnownMembers(ctx.request.body(), [])
    const user = ctx.auth.getUserOrFail()
    await deleteAddress(user.id, ctx.params.addressId, { sessionStamp: user.securityStamp })
    return ctx.response.noContent()
  }
}

// One of the caller's active addresses as the writes answer it.
async function addressOf(userId: string, addressId: string) {
  const row = await ownAddress(userId, addressId)
  // The write has just committed it; another request archiving it in between is a 404.
  if (!row) throw new DomainError('NOT_FOUND')
  const names = await placeNames([row.local_level_code])
  return addressJson(row, names.get(row.local_level_code))
}
