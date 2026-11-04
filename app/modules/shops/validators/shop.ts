import vine from '@vinejs/vine'
import { ACCOUNT_EMAIL_MAX, email, password } from '#validators/shared'

/*
 * Lower-case letters and digits in words joined by single hyphens, as the
 * registration form makes it from the shop name (`dripSlugify`).
 */
export const SHOP_SLUG_FORMAT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export const shopSignupValidator = vine.create({
  // user data
  fullName: vine.string().trim().minLength(1).maxLength(100),
  // The account's email and phone are also the shop's, and both tables
  // keep them unique.
  email: email(ACCOUNT_EMAIL_MAX)
    .unique({ table: 'users', column: 'email' })
    .unique({ table: 'shops', column: 'email' }),
  phone: vine
    .string()
    .trim()
    .minLength(7)
    .maxLength(15)
    .unique({ table: 'users', column: 'phone' })
    .unique({ table: 'shops', column: 'phone' }),
  password: password().confirmed({
    confirmationField: 'confirmPassword',
  }),

  // shop data
  // shops.name is unique until the M0 schema re-baseline (docs/04a: names
  // repeat, the slug is the identifier).
  shopName: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(100)
    .unique({ table: 'shops', column: 'name' }),
  // The shop's address in URLs (/stores/<slug>, /shops/<slug>/dashboard).
  shopSlug: vine
    .string()
    .trim()
    .minLength(1)
    .maxLength(100)
    .regex(SHOP_SLUG_FORMAT)
    .unique({ table: 'shops', column: 'slug' }),
  categories: vine
    .array(vine.string().trim().exists({ table: 'shop_categories', column: 'id' }))
    .minLength(1)
    .distinct(),
  description: vine.string().trim().maxLength(500).optional(),
  // No logo yet: multipart bodies are off in R1 (docs/06 §9.2, RF-35) and
  // photos will upload directly to storage (ADR-0013).

  // shop address
  address: vine.string().trim().minLength(1).maxLength(500),
  city: vine.string().trim().minLength(1).maxLength(100),
  district: vine.string().trim().minLength(1).maxLength(100),
  province: vine.string().trim().minLength(1).maxLength(100),
})
