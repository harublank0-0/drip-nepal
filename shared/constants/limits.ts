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
// `contactName` is a pickup address's contact, the bound of
// `shop_addresses_contact_name_check` (docs/04a §6.6), which the pickup
// form of R1-S part 1c mirrors.
export const ADDRESS_LIMITS = {
  label: { min: 1, max: 30 },
  recipientName: { min: 1, max: 100 },
  contactName: { min: 2, max: 100 },
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

// The shop fields of docs/04a §6.1 (`platform:create-shop`, docs/09 §9.8; the
// profile form of R1-S part 1b): the bounds of `shops_name_check`,
// `shops_slug_check`, `shops_return_policy_check`,
// `shops_grievance_name_check` and `shops_description_check`, counted in code
// points after NFC (docs/04 §2.8). The registration number and authority
// have no CHECK, so these bounds are the only ones; `panVat` is the 9 digits
// the validator requires while the IRD format is unconfirmed (VX-05).
export const SHOP_LIMITS = {
  name: { min: 2, max: 60 },
  slug: { min: 3, max: 40 },
  description: { max: 2000 },
  returnPolicyText: { min: 1, max: 5000 },
  grievanceContactName: { min: 2, max: 100 },
  registrationNumber: { min: 1, max: 50 },
  registrationAuthority: { min: 2, max: 100 },
  panVat: { pattern: /^[0-9]{9}$/ },
} as const

// A shop's delivery settings (docs/06 §13.5 `replaceShopShipping`; 01
// AC-FR-SHOP-004-1; docs/04a §9.7): each estimate is a whole number of days
// from 0 (same day) to 30, the bound of `shop_shipping_rates_estimate_check`
// [Assumption]. `feeMinor` is the most the rupee field reads, 9 rupee digits
// and 2 of paisa (`parseRupeesToMinor`, shared/format/money.ts; Rs
// 999,999,999.99), so every fee the server accepts loads back into the form
// (T-UI-041 pins the two together); it bounds input, it is not a price rule.
// `coverage` and `zones` only bound the request's size: the reference data
// has 77 districts and 2 zones (A-27), and the action checks each code
// against it.
export const SHIPPING_LIMITS = {
  estimateDays: { min: 0, max: 30 },
  feeMinor: { min: 0, max: 99_999_999_999 },
  coverage: { max: 100 },
  zones: { max: 20 },
} as const
