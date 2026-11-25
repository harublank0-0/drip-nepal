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

/*
 * What the worker accepts and writes (01 AC-FR-MED-001-2, ADR-0013 decision
 * 3, 03 §7.5): at most 40 megapixels, and at most 12 megapixels for an
 * interlaced image [Assumption, ADR-0013], since decoding one costs more
 * memory; WebP derivatives at these widths [Assumption, 01], never wider
 * than the image, so an image narrower than the smallest width gets one
 * derivative at its own width. Derivatives are immutable (content-addressed
 * keys), so they are cached for a year (ADR-0013 decision 4).
 */
export const MAX_IMAGE_PIXELS = 40_000_000
export const MAX_INTERLACED_PIXELS = 12_000_000
export const DERIVED_WIDTHS = [320, 640, 1024, 1600] as const
export const DERIVED_CACHE_CONTROL = 'public, max-age=31536000, immutable'

// The widths to write for an image `width` pixels wide (as displayed).
export function derivedWidthsFor(width: number): number[] {
  const widths = DERIVED_WIDTHS.filter((candidate) => candidate <= width)
  return widths.length > 0 ? widths : [width]
}
