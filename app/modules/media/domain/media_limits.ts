/*
 * The upload limits of docs/06 §9.2 and ADR-0013 (01 AC-FR-MED-001-1,
 * A-31): an image of at most 10 MB, JPEG, PNG or WebP (PDF only for a KYC
 * document, not built in R1-S), uploaded through a presigned URL valid for
 * 10 minutes. `media_assets_bytes_check` and `media_assets_mime_check` are
 * the database's half.
 */
export const MEDIA_MAX_BYTES = 10_485_760

export const UPLOAD_URL_SECONDS = 600

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type ImageMimeType = (typeof IMAGE_MIME_TYPES)[number]
