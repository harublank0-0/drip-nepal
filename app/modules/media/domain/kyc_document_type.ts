/*
 * `media_assets.document_type` (docs/04a §7.13): the values of
 * `media_assets_document_type_check`, in its order. T-ARCH-011 fails if the
 * two differ (docs/04 §2.4). Set exactly when `kind` is `kyc_document`.
 */
export const KYC_DOCUMENT_TYPES = [
  'business_registration_certificate',
  'pan_vat_certificate',
  'owner_identity_document',
  'other',
] as const
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number]
