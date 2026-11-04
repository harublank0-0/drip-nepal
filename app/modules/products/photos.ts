import sharp, { type Metadata } from 'sharp'

/*
 * Product photos are re-encoded before they are stored, so the storefront
 * never serves a seller's original file. The widths come from the set of
 * AC-FR-MED-001-2 (docs/01): 1600 px for the product page, 640 px for cards,
 * thumbnails and order lines. The safety rules follow ADR-0013, which the
 * M3 media pipeline implements in full.
 */
export const PHOTO_WIDTHS = { large: 1600, small: 640 } as const

/*
 * A larger image could exhaust memory when decoded (a "decompression bomb").
 */
export const MAX_PHOTO_PIXELS = 40_000_000

const WEBP_QUALITY = 80

/*
 * Decode only the three accepted formats, whatever the file claims to be:
 * every other libvips loader (SVG, PDF, TIFF, GIF, ...) is blocked.
 */
sharp.block({ operation: ['VipsForeignLoad'] })
sharp.unblock({
  operation: ['VipsForeignLoadJpegBuffer', 'VipsForeignLoadPngBuffer', 'VipsForeignLoadWebpBuffer'],
})
// One image at a time and no cache: the server has 1 vCPU and 2 GB.
sharp.concurrency(1)
sharp.cache(false)

export class PhotoRejected extends Error {}

/*
 * The file's first bytes, not its name, say what it is.
 */
function isAcceptedFormat(input: Buffer) {
  const startsWith = (bytes: number[], at = 0) => bytes.every((byte, i) => input[at + i] === byte)
  const jpeg = startsWith([0xff, 0xd8, 0xff])
  const png = startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const webp = startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)
  return jpeg || png || webp
}

export type ProcessedPhoto = { data: Buffer; width: number; height: number }

/*
 * Checks a product photo and returns it as two WebP images. Metadata (EXIF,
 * GPS, XMP) is dropped: sharp writes none unless asked to. Throws
 * PhotoRejected with a message for the seller when the file can't be used.
 */
export async function processProductPhoto(
  input: Buffer
): Promise<{ large: ProcessedPhoto; small: ProcessedPhoto }> {
  if (!isAcceptedFormat(input)) {
    throw new PhotoRejected("This photo isn't a JPEG, PNG or WebP image.")
  }

  const options = { limitInputPixels: MAX_PHOTO_PIXELS, failOn: 'warning' as const }
  let header: Metadata
  try {
    header = await sharp(input, { ...options, limitInputPixels: false }).metadata()
  } catch {
    throw new PhotoRejected(
      "This photo couldn't be read. It may be damaged; try exporting it again."
    )
  }
  if ((header.width ?? 0) * (header.height ?? 0) > MAX_PHOTO_PIXELS) {
    throw new PhotoRejected(
      'This photo is too large (over 40 megapixels). Resize it and try again.'
    )
  }

  const encode = async (width: number): Promise<ProcessedPhoto> => {
    const { data, info } = await sharp(input, options)
      .autoOrient()
      .toColorspace('srgb')
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height }
  }

  try {
    return { large: await encode(PHOTO_WIDTHS.large), small: await encode(PHOTO_WIDTHS.small) }
  } catch {
    throw new PhotoRejected(
      "This photo couldn't be read. It may be damaged; try exporting it again."
    )
  }
}
