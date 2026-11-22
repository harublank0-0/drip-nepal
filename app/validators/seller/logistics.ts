import vine from '@vinejs/vine'

/*
 * Seller inputs of the M6 courier operations (docs/06 §13.8). Credentials are
 * the courier's documented fields: for NCM a token [Verify-external VX-16],
 * printable ASCII without spaces, as the adapter checks before any call.
 */

const uuid = () => vine.string().uuid()
const token = () =>
  vine
    .string()
    .minLength(8)
    .maxLength(200)
    .regex(/^[\x21-\x7e]+$/)

export const LOGISTICS_SETTINGS_MEMBERS = ['fulfillment_mode', 'default_account_id'] as const
export const replaceLogisticsSettingsValidator = vine.create({
  fulfillment_mode: vine.enum(['manual', 'vendor', 'platform'] as const),
  default_account_id: uuid().nullable().optional(),
})

export const COURIER_ACCOUNT_MEMBERS = [
  'provider_code',
  'name',
  'environment',
  'external_account_ref',
  'credentials',
  'password',
] as const
export const createShopCourierAccountValidator = vine.create({
  provider_code: vine.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  name: vine.string().trim().minLength(2).maxLength(80),
  environment: vine.enum(['sandbox', 'production'] as const),
  external_account_ref: vine.string().trim().minLength(1).maxLength(100).nullable().optional(),
  credentials: vine.object({ token: token() }),
  password: vine.string().minLength(1).maxLength(128),
})

export const REKEY_MEMBERS = ['credentials', 'password'] as const
export const rekeyShopCourierAccountValidator = vine.create({
  credentials: vine.object({ token: token() }),
  password: vine.string().minLength(1).maxLength(128),
})

export const DISABLE_MEMBERS = ['password'] as const
export const disableShopCourierAccountValidator = vine.create({
  password: vine.string().minLength(1).maxLength(128),
})

const phone = () =>
  vine
    .string()
    .trim()
    .regex(/^(9[678]\d{8}|0\d{6,9})$/)
const addressFields = {
  label: vine.string().trim().minLength(1).maxLength(30).nullable().optional(),
  contact_name: vine.string().trim().minLength(2).maxLength(100),
  contact_phone: phone(),
  province_code: vine.string().regex(/^[1-7]$/),
  district_code: vine.string().regex(/^[1-7][0-9]{2}$/),
  local_level_code: vine.string().regex(/^[1-7][0-9]{4}$/),
  ward_no: vine.number().withoutDecimals().range([1, 40]),
  area_tole: vine.string().trim().minLength(2).maxLength(200),
  street_landmark: vine.string().trim().minLength(1).maxLength(200).nullable().optional(),
}

export const PICKUP_ADDRESS_MEMBERS = [...Object.keys(addressFields), 'is_default'] as const
export const createPickupAddressValidator = vine.create({
  label: addressFields.label,
  contact_name: addressFields.contact_name,
  contact_phone: addressFields.contact_phone,
  province_code: addressFields.province_code,
  district_code: addressFields.district_code,
  local_level_code: addressFields.local_level_code,
  ward_no: addressFields.ward_no,
  area_tole: addressFields.area_tole,
  street_landmark: addressFields.street_landmark,
  is_default: vine.boolean().optional(),
})

// A PATCH: either every address field (an edit) or none, plus `is_default`.
export const updatePickupAddressValidator = vine.create({
  label: addressFields.label,
  contact_name: addressFields.contact_name.optional(),
  contact_phone: phone().optional(),
  province_code: vine
    .string()
    .regex(/^[1-7]$/)
    .optional(),
  district_code: vine
    .string()
    .regex(/^[1-7][0-9]{2}$/)
    .optional(),
  local_level_code: vine
    .string()
    .regex(/^[1-7][0-9]{4}$/)
    .optional(),
  ward_no: vine.number().withoutDecimals().range([1, 40]).optional(),
  area_tole: vine.string().trim().minLength(2).maxLength(200).optional(),
  street_landmark: addressFields.street_landmark,
  is_default: vine.boolean().optional(),
})

export const BOOKING_MEMBERS = [
  'account_id',
  'pickup_address_id',
  'service_code',
  'origin_branch_id',
  'destination_branch_id',
] as const
export const bookCourierShipmentValidator = vine.create({
  account_id: uuid(),
  pickup_address_id: uuid(),
  service_code: vine.string().trim().minLength(1).maxLength(40),
  origin_branch_id: uuid().nullable().optional(),
  destination_branch_id: uuid().nullable().optional(),
})

export const CANCEL_MEMBERS = ['reason'] as const
export const cancelCourierBookingValidator = vine.create({
  reason: vine.string().trim().minLength(1).maxLength(200).nullable().optional(),
})
