import vine from '@vinejs/vine'

export const trackOrderValidator = vine.create({
  orderNumber: vine
    .string()
    .trim()
    .toUpperCase()
    .maxLength(30)
    .regex(/^[A-Z0-9-]+$/),
  phone: vine.string().trim().minLength(10).maxLength(20),
})
