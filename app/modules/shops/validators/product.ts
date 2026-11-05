import vine, { SimpleMessagesProvider } from '@vinejs/vine'
import { MAX_PRODUCT_IMAGES, ProductGenderValues, ProductStatus } from '#constants/product'
import { PRICE_MAX_MINOR, PRICE_MESSAGES } from '#shared/constants/money'

/*
 * The bodyparser turns empty form inputs into null, which `optional()`
 * treats as missing.
 */
const optionalText = (max: number) => vine.string().trim().maxLength(max).optional()

/*
 * Prices are whole paisa (docs/04 §18.1): the form turns the rupees typed
 * into paisa with parseRupeesToMinor before sending.
 */
const paisa = () => vine.number().withoutDecimals().min(0).max(PRICE_MAX_MINOR)

const variant = vine.object({
  id: vine.string().uuid().optional(),
  size: optionalText(30),
  color: optionalText(30),
  sku: optionalText(100),
  priceMinor: paisa(),
  comparePriceMinor: paisa().optional().nullable(),
  quantity: vine.number().withoutDecimals().min(0).max(1_000_000),
  // The stock the form showed for an existing variant (docs/05 §5.9).
  expectedQuantity: vine.number().withoutDecimals().min(0).max(1_000_000).optional(),
})

/*
 * Create and update share one shape. Images come as new uploads (`images`)
 * plus the ids of already-uploaded images to keep (`keepMediaIds`, in
 * display order; new uploads go after them).
 */
export const productValidator = vine.create({
  name: vine.string().trim().minLength(2).maxLength(100),
  description: optionalText(5000),
  categoryId: vine.string().uuid().exists({ table: 'categories', column: 'id' }),
  gender: vine.enum(ProductGenderValues),
  brand: optionalText(100),
  status: vine.enum([ProductStatus.DRAFT, ProductStatus.ACTIVE]),
  variants: vine.array(variant).minLength(1).maxLength(100),
  keepMediaIds: vine.array(vine.string().uuid()).maxLength(MAX_PRODUCT_IMAGES).optional(),
  images: vine
    .array(vine.file({ size: '5mb', extnames: ['jpg', 'jpeg', 'png', 'webp'] }))
    .maxLength(MAX_PRODUCT_IMAGES)
    .optional(),
})

export type ProductPayload = Awaited<ReturnType<typeof productValidator.validate>>

// Shown under the product form's price fields (only those: a stock
// number's messages stay VineJS's own).
const priceMessages = (field: string) => ({
  [`variants.*.${field}.number`]: PRICE_MESSAGES.unreadable,
  [`variants.*.${field}.withoutDecimals`]: PRICE_MESSAGES.unreadable,
  [`variants.*.${field}.min`]: PRICE_MESSAGES.unreadable,
  [`variants.*.${field}.max`]: PRICE_MESSAGES.tooHigh,
})
productValidator.messagesProvider = new SimpleMessagesProvider({
  'variants.*.priceMinor.required': PRICE_MESSAGES.missing,
  ...priceMessages('priceMinor'),
  ...priceMessages('comparePriceMinor'),
})
