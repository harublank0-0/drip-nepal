import vine from '@vinejs/vine'

/*
 * `confirmEmail` (docs/06 §13.3): the raw token from the emailed link
 * (32 random bytes, base64url, docs/07 §3.8). Only its type and length are
 * checked here: a missing or empty token (null once the body parser turns
 * empty strings into null), one that is not a string, or one longer than
 * 256 characters answers 422 on `token` with Vine's `required`, `string`
 * or `max_length`. Any other string reaches the action, which answers
 * whether it is a live `email_verification` token, so a malformed token
 * within the length and an unknown one get the same `token_invalid`.
 */
export const CONFIRM_EMAIL_MEMBERS = ['token'] as const

export const confirmEmailValidator = vine.create({
  token: vine.string().trim().minLength(1).maxLength(256),
})
