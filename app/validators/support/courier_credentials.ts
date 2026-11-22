import vine from '@vinejs/vine'
import { COURIER_LIMITS } from '#shared/constants/limits'

/*
 * A courier account's credentials in a request (docs/06 §13.8): for NCM a
 * token [Verify-external VX-16], printable ASCII without spaces, as the
 * adapter checks before any call. Shared by the seller's and staff's account
 * operations.
 */
export const courierCredentials = () =>
  vine.object({
    token: vine
      .string()
      .minLength(COURIER_LIMITS.token.min)
      .maxLength(COURIER_LIMITS.token.max)
      .regex(COURIER_LIMITS.token.pattern),
  })
