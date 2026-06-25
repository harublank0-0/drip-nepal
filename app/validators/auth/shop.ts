import vine from '@vinejs/vine'
import { email } from '#validators/shared'

/*
 * Validator to use when user is creating a shop
 */
export const shopSignupValidator = vine.create({
  email: email().unique({ table: 'users', column: 'email' }),
  name: vine.string(),
  description: vine.string(),
  phone: vine.string(),
})
