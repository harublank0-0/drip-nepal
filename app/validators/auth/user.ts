import { email, password } from '#validators/shared'
import vine from '@vinejs/vine'

/**
 * Validator to use when performing self-signup
 */
export const signupValidator = vine.create({
  fullName: vine.string(),
  email: email().unique({ table: 'users', column: 'email' }),
  phone: vine.string().optional(),
  password: password().confirmed({
    confirmationField: 'passwordConfirmation',
  }),
})

/**
 * Validator to use when performing login
 */
export const loginValidator = vine.create({
  email: email(),
  password: password(),
})
