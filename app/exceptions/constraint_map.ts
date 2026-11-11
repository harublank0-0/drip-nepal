import type { ProblemCode } from '#exceptions/problem_codes'

/*
 * The constraint allowlist (docs/06 §5.3, docs/09 §5.4): the only unique
 * keys (SQLSTATE 23505) and CHECK constraints (23514) whose violation
 * answers a 422 instead of 500 `INTERNAL`. Each maps a constraint of docs/04a
 * to the request field it stands for. A constraint missing here answers 500,
 * so no database message ever reaches a client.
 *
 * `users_email_key` is deliberately absent: `signUp` catches that violation
 * and answers the neutral 202, so the handler can never tell a caller an
 * address is registered (RF-38).
 */
export type ConstraintMapping =
  | { sqlstate: '23505' | '23514'; field: string; item: string; message: string }
  | { sqlstate: '23514'; code: ProblemCode }

const unique = (field: string): ConstraintMapping => ({
  sqlstate: '23505',
  field,
  item: 'unique',
  message: 'This value is already in use.',
})

const check = (field: string): ConstraintMapping => ({
  sqlstate: '23514',
  field,
  item: 'invalid',
  message: 'This value is not allowed.',
})

export const CONSTRAINT_MAP: Readonly<Record<string, ConstraintMapping>> = {
  shops_slug_key: unique('slug'),
  // Backstops only: the error has no row index, so the variant actions
  // pre-check duplicates and answer `variants.N.sku` themselves (docs/04 §16.5).
  product_variants_shop_sku_key: unique('variants'),
  product_variants_product_signature_key: unique('variants'),
  vendor_remittances_reference_key: unique('reference'),

  platform_settings_value_check: check('value'),
  refunds_amount_check: check('amount_minor'),
  products_title_check: check('title'),
  products_country_check: check('country_of_origin'),
  products_description_check: check('description'),
  products_manufacturer_name_check: check('manufacturer_name'),
  products_warranty_text_check: check('warranty_text'),
  products_care_and_precautions_check: check('care_and_precautions'),
  // The T-SEC-004 backstop: a refund above the captured amount.
  payments_refunded_le_captured_check: { sqlstate: '23514', code: 'REFUND_EXCEEDS_REFUNDABLE' },
}
