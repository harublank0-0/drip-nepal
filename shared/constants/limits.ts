/*
 * Input limits that a Vine validator and a form both use (docs/09 §13.5), so
 * a client rule mirrors the server's and never refuses what it accepts
 * (docs/08 §7.1 "Client rules mirror").
 */

// The account fields of `signUp` and `updateMe` (docs/06 §13.3; 01
// AC-FR-IAM-001-1): the email rule of `users_email_check`, the name of
// `users_full_name_check`, and the password of docs/07 §3.7 [Assumption A-22].
// `phoneInput` bounds what a phone field accepts before it is normalised
// (`shared/format/phone.ts`).
export const ACCOUNT_LIMITS = {
  email: { min: 3, max: 254 },
  fullName: { min: 1, max: 100 },
  password: { min: 10, max: 128 },
  phoneInput: { max: 32 },
} as const

// The address book of docs/06 §13.4 (`createAddress`, `updateAddress`; 01
// FR-IAM-012). `label` is the bound of `user_addresses_label_check`; the
// encrypted members have no CHECK on their length (docs/04a §5.5), so these
// bounds, the pickup address's, are the only ones; names count code points
// after NFC (docs/04 §2.8). `wardNo` is the bound of
// `user_addresses_ward_no_check`: the exact upper bound is the local level's
// `ward_count` (AC-FR-IAM-012-2). `maxActive` is the 10-address cap of
// AC-FR-IAM-012-4 [Assumption], kept here so it changes in one place.
export const ADDRESS_LIMITS = {
  label: { min: 1, max: 30 },
  recipientName: { min: 1, max: 100 },
  areaTole: { min: 2, max: 200 },
  streetLandmark: { min: 1, max: 200 },
  wardNo: { min: 1, max: 40 },
  maxActive: 10,
} as const

// The courier account operations of docs/06 §13.8 (`createShopCourierAccount`,
// `adminCreateLogisticsAccount`, the re-key and status changes).
export const COURIER_LIMITS = {
  accountName: { min: 2, max: 80 },
  accountRef: { min: 1, max: 100 },
  // An NCM token [Verify-external VX-16]: printable ASCII without spaces.
  token: { min: 8, max: 200, pattern: /^[\x21-\x7e]+$/ },
  reason: { min: 3, max: 500 },
} as const
