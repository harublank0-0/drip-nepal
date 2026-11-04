import vine from '@vinejs/vine'
import { MAX_QUANTITY_PER_ITEM } from '#constants/order'

export const addToCartValidator = vine.create({
  variantId: vine.string().uuid(),
  quantity: vine.number().withoutDecimals().min(1).max(MAX_QUANTITY_PER_ITEM),
})

export const updateCartItemValidator = vine.create({
  quantity: vine.number().withoutDecimals().min(0).max(MAX_QUANTITY_PER_ITEM),
})
