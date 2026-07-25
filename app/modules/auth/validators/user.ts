import { email, password } from '#validators/shared'
import vine from '@vinejs/vine'
import { Infer } from '@vinejs/vine/types'

export const userSignupObject = vine.object({
  fullName: vine.string(),
  email: email().unique({ table: 'users', column: 'email' }),
  phone: vine.string().optional(),
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
