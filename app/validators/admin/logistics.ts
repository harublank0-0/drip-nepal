import vine from '@vinejs/vine'
import { courierCredentials } from '#validators/support/courier_credentials'
import { COURIER_LIMITS } from '#shared/constants/limits'
import { TOTP_CODE_PATTERN } from '#shared/constants/auth'

// Staff inputs of the M6 courier operations (docs/06 §13.8).

/*
 * `totp_code` (R1-S part 1c-ii): the code OD-44's single-operator exception
 * needs for an action on the staff member's own shop, and that satisfies a
 * step-up operation's 15-minute window (docs/07 §3.10, §4.1 rule 4). Six
 * digits, checked by the action, never part of the idempotency fingerprint
 * (docs/06 §7.2). Optional here: whether it is needed is the action's call.
 */
const totpCode = () => vine.string().trim().regex(TOTP_CODE_PATTERN).optional()

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

export const ACCOUNT_STATUS_MEMBERS = ['status', 'reason', 'totp_code'] as const
export const setLogisticsAccountStatusValidator = vine.create({
  status: vine.enum(['suspended', 'pending', 'disabled'] as const),
  reason: vine
    .string()
    .trim()
    .minLength(COURIER_LIMITS.reason.min)
    .maxLength(COURIER_LIMITS.reason.max),
  totp_code: totpCode(),
})

// adminAllowShopOnLogisticsAccount, adminRemoveShopFromLogisticsAccount: no body but the code.
export const SHOP_LINK_MEMBERS = ['totp_code'] as const
export const shopLinkValidator = vine.create({ totp_code: totpCode() })

export const SHOP_ENABLED_MEMBERS = ['is_enabled', 'reason', 'totp_code'] as const
export const setShopLogisticsEnabledValidator = vine.create({
  is_enabled: vine.boolean(),
  reason: vine.string().trim().minLength(3).maxLength(500),
  totp_code: totpCode(),
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

export const RESOLVE_BOOKING_MEMBERS = [
  'outcome',
  'external_shipment_id',
  'note',
  'totp_code',
] as const
export const resolveCourierBookingValidator = vine.create({
  outcome: vine.enum(['booked', 'booking_failed', 'cancelled', 'cancel_declined'] as const),
  external_shipment_id: vine.string().trim().minLength(1).maxLength(100).nullable().optional(),
  note: vine.string().trim().minLength(3).maxLength(500),
  totp_code: totpCode(),
})

export const RESOLVE_EVENT_MEMBERS = ['processing_status', 'note', 'totp_code'] as const
export const resolveCourierEventValidator = vine.create({
  processing_status: vine.enum(['applied', 'ignored'] as const),
  note: vine.string().trim().minLength(3).maxLength(500),
  totp_code: totpCode(),
})

export const VERIFICATION_MEMBERS = [
  'verification_status',
  'verification_method',
  'verification_notes',
  'totp_code',
] as const
export const recordOrderVerificationValidator = vine.create({
  verification_status: vine.enum(['verified', 'review_required', 'failed'] as const),
  verification_method: vine.enum(['phone_call', 'manual'] as const),
  verification_notes: vine.string().trim().minLength(1).maxLength(500).nullable().optional(),
  totp_code: totpCode(),
})
