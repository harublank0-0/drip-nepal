import vine from '@vinejs/vine'
import { IMAGE_MIME_TYPES, MEDIA_MAX_BYTES } from '#modules/media/domain/media_limits'

/*
 * `createMediaUpload` (docs/06 §13.5; `CreateMediaUploadRequest` in
 * openapi.yaml; ADR-0013 decision 2; R1-S part 2d-i). The members are the
 * whole input: anything else, `shop_id` included, is refused with
 * `unknown_field` before this runs (T-SEC-003).
 *
 * - `kind`: `product_image`, the one kind R1-S needs. Logo and banner
 *   (FR-MED-003, if wanted) and KYC documents, with `document_type`, join
 *   with their features (docs/12 §9).
 * - `mime`: JPEG, PNG or WebP (A-31); the worker checks the bytes.
 * - `bytes`: the declared size, 1 to 10 MB (`max` above, 06 §9.2).
 */
export const CREATE_MEDIA_UPLOAD_MEMBERS = ['kind', 'mime', 'bytes'] as const

export const createMediaUploadValidator = vine.create({
  kind: vine.enum(['product_image'] as const),
  mime: vine.enum(IMAGE_MIME_TYPES),
  bytes: vine.number({ strict: true }).withoutDecimals().min(1).max(MEDIA_MAX_BYTES),
})
