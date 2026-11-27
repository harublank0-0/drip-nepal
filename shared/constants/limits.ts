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

// A product's text fields (docs/04a §7.6; 06 §13.5 `createProduct`,
// `updateProduct`; R1-S part 2a): the bounds of `products_title_check` and
// the four disclosure CHECKs, counted in code points after NFC and trim
// (docs/04 §2.8). The maxima are [Assumption] values of 04a. `attributeValues`
// bounds one attribute's value list in a request; the reference data has
// fewer values per attribute.
export const PRODUCT_LIMITS = {
  title: { min: 3, max: 120 },
  description: { max: 5000 },
  manufacturerName: { max: 200 },
  warrantyText: { max: 1000 },
  careAndPrecautions: { max: 2000 },
  attributes: { max: 30 },
  attributeValues: { max: 20 },
} as const

/*
 * A product's variant set (docs/04a §7.8, §7.9; 01 AC-FR-CAT-004-1,
 * AC-FR-CAT-004-4; R1-S part 2b, shared with the variant editor in 2f-ii):
 * at most 2 option axes and 100 variants; a SKU of 1 to 64 characters in
 * the shape of `product_variants_sku_check`; prices and compare-at prices
 * from 0 to 100,000,000 paisa (Rs 10,00,000); a weight of 1 to 50,000 g
 * (`product_variants_weight_check`).
 */
export const VARIANT_LIMITS = {
  axes: { max: 2 },
  variants: { min: 1, max: 100 },
  sku: { min: 1, max: 64, pattern: /^[A-Za-z0-9][A-Za-z0-9._/-]*$/ },
  priceMinor: { min: 0, max: 100_000_000 },
  weightGrams: { min: 1, max: 50_000 },
} as const

/*
 * A product's gallery (docs/04a §7.14, 01 FR-MED-002; R1-S part 2d-iii): at
 * most 12 images, positions 1 to 12, alt text of 1 to 150 characters in
 * code points (`product_media_position_check`, `product_media_alt_text_check`).
 */
export const PRODUCT_MEDIA_LIMITS = {
  items: { max: 12 },
  altText: { min: 1, max: 150 },
} as const

/*
 * Stock (docs/04a §8.1, §8.3; R1-S parts 2c and 2f-iv-a): a quantity fits the
 * `int` columns `inventory_items.on_hand` and `reserved`, and a movement's
 * note is 1 to 500 characters (`inventory_movements_note_check`). The stock
 * validators and the stock page's dialogs read these.
 */
export const STOCK_LIMITS = {
  units: { max: 2_147_483_647 },
  note: { max: 500 },
} as const

/*
 * What an upload may be (docs/06 §9.2, ADR-0013; 01 AC-FR-MED-001-1): an
 * image of at most 10 MB, JPEG, PNG or WebP. The media module's validator
 * and the editor's uploader read these (R1-S part 2g-ii);
 * `media_assets_bytes_check` and `media_assets_mime_check` are the
 * database's half.
 */
export const MEDIA_UPLOAD_LIMITS = {
  maxBytes: 10_485_760,
  imageTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const
