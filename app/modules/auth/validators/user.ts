import { ACCOUNT_EMAIL_MAX, email, password } from '#validators/shared'
import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'

export const userSignupObject = vine.object({
  // users.full_name is varchar(100); docs/04a: 1–100 characters.
  fullName: vine.string().trim().minLength(1).maxLength(100),
  email: email(ACCOUNT_EMAIL_MAX).unique({ table: 'users', column: 'email' }),
  phone: vine.string().trim().maxLength(15).unique({ table: 'users', column: 'phone' }).optional(),
  password: password().confirmed({
    confirmationField: 'passwordConfirmation',
  }),
})

/**
 * Validator to use when performing self-signup
 */
export const userSignupValidator = vine.create(userSignupObject)

export type UserSignupPayload = Infer<typeof userSignupValidator>
/**
 * Validator to use when performing login
 */
export const userLoginValidator = vine.create({
  email: email(),
  password: password(),
})
