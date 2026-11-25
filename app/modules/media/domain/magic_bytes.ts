import type { ImageMimeType } from '#modules/media/domain/media_limits'

/*
 * The file signatures the worker checks before any image library sees the
 * bytes (docs/03 §7.5 "Parsing order", 07 TM-15, ADR-0013 decision 3):
 * JPEG (`FF D8 FF`), PNG (the 8-byte signature) and WebP (`RIFF`, a size,
 * `WEBP`). Anything else, SVG, HTML, GIF, TIFF, HEIC and AVIF included, is
 * null, and the worker rejects it without calling sharp. PDF joins with KYC
 * documents, which R1-S does not offer.
 */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((byte, index) => bytes[offset + index] === byte)

const ascii = (text: string) => [...text].map((char) => char.charCodeAt(0))

export function sniffImageType(bytes: Uint8Array): ImageMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, PNG_SIGNATURE)) return 'image/png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  return null
}
