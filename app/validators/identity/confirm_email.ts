import vine from '@vinejs/vine'

/*
 * `confirmEmail` (docs/06 §13.3): the raw token from the emailed link
 * (32 random bytes, base64url, docs/07 §3.8). Only its length is checked
 * here; whether it is a live `email_verification` token is the action's
 * answer, so a malformed token and an unknown one get the same 422.
 */
export const CONFIRM_EMAIL_MEMBERS = ['token'] as const

export const confirmEmailValidator = vine.create({
  token: vine.string().trim().minLength(1).maxLength(256),
})
