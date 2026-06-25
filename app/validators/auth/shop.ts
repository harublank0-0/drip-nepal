import vine from '@vinejs/vine'
import { email, password } from '#validators/shared'

export const shopSignupValidator = vine.create({
  fullName: vine.string().trim().minLength(1).maxLength(100),
  email: email().unique({ table: 'users', column: 'email' }),
  phone: vine.string().trim().minLength(7).maxLength(15),
  password: password().confirmed({
    confirmationField: 'confirmPassword',
  }),
  shopName: vine.string().trim().minLength(1).maxLength(100),
  shopSlug: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(100)
    .unique({ table: 'shops', column: 'slug' }),
  category: vine.string().trim().minLength(1).maxLength(100),
  description: vine.string().trim().maxLength(500).optional(),
  address: vine.string().trim().minLength(1).maxLength(500),
  city: vine.string().trim().minLength(1).maxLength(100),
  district: vine.string().trim().minLength(1).maxLength(100),
  province: vine.string().trim().minLength(1).maxLength(100),
})
