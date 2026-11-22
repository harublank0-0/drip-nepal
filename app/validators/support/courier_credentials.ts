import vine from '@vinejs/vine'

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
      .minLength(8)
      .maxLength(200)
      .regex(/^[\x21-\x7e]+$/),
  })
