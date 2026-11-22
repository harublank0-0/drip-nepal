import vine from '@vinejs/vine'
import { courierCredentials } from '#validators/support/courier_credentials'
import { COURIER_LIMITS } from '#shared/constants/limits'

// Staff inputs of the M6 courier operations (docs/06 §13.8).

// adminCreateLogisticsAccount: a platform-owned account (OD-58).
export const CREATE_ACCOUNT_MEMBERS = [
  'provider_code',
  'name',
  'environment',
  'external_account_ref',
  'credentials',
] as const
export const createLogisticsAccountValidator = vine.create({
  provider_code: vine.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
  name: vine
    .string()
    .trim()
    .minLength(COURIER_LIMITS.accountName.min)
    .maxLength(COURIER_LIMITS.accountName.max),
  environment: vine.enum(['sandbox', 'production'] as const),
  external_account_ref: vine
    .string()
    .trim()
    .minLength(COURIER_LIMITS.accountRef.min)
    .maxLength(COURIER_LIMITS.accountRef.max)
    .nullable()
    .optional(),
  credentials: courierCredentials(),
})

export const REKEY_ACCOUNT_MEMBERS = ['credentials'] as const
export const rekeyLogisticsAccountValidator = vine.create({
  credentials: courierCredentials(),
})

export const ACCOUNT_STATUS_MEMBERS = ['status', 'reason'] as const
export const setLogisticsAccountStatusValidator = vine.create({
  status: vine.enum(['suspended', 'pending', 'disabled'] as const),
  reason: vine
    .string()
    .trim()
    .minLength(COURIER_LIMITS.reason.min)
    .maxLength(COURIER_LIMITS.reason.max),
})

export const SHOP_ENABLED_MEMBERS = ['is_enabled', 'reason'] as const
export const setShopLogisticsEnabledValidator = vine.create({
  is_enabled: vine.boolean(),
  reason: vine.string().trim().minLength(3).maxLength(500),
})

export const SYNC_MEMBERS = ['provider_code'] as const
export const syncBranchesValidator = vine.create({
  provider_code: vine.string().regex(/^[a-z][a-z0-9_]{1,31}$/),
})

export const BRANCH_MEMBERS = ['district_code'] as const
export const updateBranchValidator = vine.create({
  district_code: vine
    .string()
    .regex(/^[1-7][0-9]{2}$/)
    .nullable(),
})

export const RESOLVE_BOOKING_MEMBERS = ['outcome', 'external_shipment_id', 'note'] as const
export const resolveCourierBookingValidator = vine.create({
  outcome: vine.enum(['booked', 'booking_failed', 'cancelled', 'cancel_declined'] as const),
  external_shipment_id: vine.string().trim().minLength(1).maxLength(100).nullable().optional(),
  note: vine.string().trim().minLength(3).maxLength(500),
})

export const RESOLVE_EVENT_MEMBERS = ['processing_status', 'note'] as const
export const resolveCourierEventValidator = vine.create({
  processing_status: vine.enum(['applied', 'ignored'] as const),
  note: vine.string().trim().minLength(3).maxLength(500),
})

export const VERIFICATION_MEMBERS = [
  'verification_status',
  'verification_method',
  'verification_notes',
] as const
export const recordOrderVerificationValidator = vine.create({
  verification_status: vine.enum(['verified', 'review_required', 'failed'] as const),
  verification_method: vine.enum(['phone_call', 'manual'] as const),
  verification_notes: vine.string().trim().minLength(1).maxLength(500).nullable().optional(),
})
