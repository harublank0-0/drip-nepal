import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { ProvincesWithDistricts } from '#shared/constants/provinces_with_districts'

const PROVINCES = Object.keys(ProvincesWithDistricts)

/*
 * The district must belong to the chosen province.
 */
const districtInProvince = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  const province = field.parent?.province as keyof typeof ProvincesWithDistricts | undefined
  const districts = province ? Object.keys(ProvincesWithDistricts[province] ?? {}) : []
  if (!districts.includes(value)) {
    field.report('Choose a district in the selected province', 'district', field)
  }
})

export const addressSchema = vine.object({
  label: vine.string().trim().maxLength(50).optional(),
  recipientName: vine.string().trim().minLength(2).maxLength(100),
  recipientPhone: vine
    .string()
    .trim()
    .regex(/^(\+977)?9[678]\d{8}$/),
  province: vine.enum(PROVINCES),
  district: vine.string().trim().use(districtInProvince()),
  municipality: vine.string().trim().maxLength(50).optional(),
  city: vine.string().trim().minLength(2).maxLength(50),
  area: vine.string().trim().maxLength(50).optional(),
  streetAddress: vine.string().trim().minLength(3).maxLength(200),
})

/*
 * Pay with an address from the address book (`addressId`) or a new one
 * (`address`, saved to the address book).
 */
export const checkoutValidator = vine.create({
  addressId: vine.string().uuid().optional().requiredIfMissing('address'),
  address: addressSchema.optional(),
  notes: vine.string().trim().maxLength(500).optional(),
})

export type CheckoutPayload = Infer<typeof checkoutValidator>
export type AddressPayload = Infer<typeof addressSchema>
