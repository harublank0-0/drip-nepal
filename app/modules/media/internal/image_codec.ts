import type { Sharp, SharpOptions } from 'sharp'
import { MAX_IMAGE_PIXELS } from '#modules/media/domain/media_limits'

/*
 * The only code that calls sharp (docs/03 §7.5, 07 TM-15, ADR-0013 decision
 * 3; `.dependency-cruiser.cjs` keeps it here). sharp ≥ 0.35.4 (09 §10.6).
 *
 * - When sharp is first loaded, before the first image, every libvips
 *   loader is blocked and only the
 *   JPEG, PNG and WebP buffer loaders are unblocked, so the HEIF, AVIF,
 *   TIFF, GIF, SVG and PDF loaders in sharp's binaries never parse an
 *   upload, whatever its bytes say. The class names were confirmed on
 *   2026-11-25 with sharp 0.35.5 (libvips 8.18.7): with only these three
 *   unblocked, GIF, TIFF and AVIF buffers are refused (T-SEC-018). The
 *   operation cache is off (each buffer is seen once) and libvips uses one
 *   thread per image, for the worker's memory budget (11 §13.2). `load`
 *   is separate from the checks, so a sharp that cannot load throws and
 *   the job is retried, instead of rejecting a valid image as damaged; a
 *   failed load is tried again on the next job.
 * - Every pipeline opens the bytes with `limitInputPixels` 40 MP and
 *   `failOn: 'warning'`, so an image over the limit, truncated or damaged
 *   throws instead of decoding.
 * - `inspect` reads the header only: the format and the size as displayed
 *   (EXIF orientation applied), and whether it is interlaced.
 * - `derive` decodes, applies the orientation, converts to sRGB and writes
 *   WebP at each width, never enlarging. sharp writes no metadata unless
 *   asked, so the derivatives carry no EXIF, GPS, XMP or ICC data.
 *
 * The worker takes an `ImageCodec`, so a test can count the calls and show
 * that a file refused by its signature never reaches sharp.
 */
export const IMAGE_LOADERS = [
  'VipsForeignLoadJpegBuffer',
  'VipsForeignLoadPngBuffer',
  'VipsForeignLoadWebpBuffer',
] as const

export type ImageInspection = {
  format: string
  width: number
  height: number
  interlaced: boolean
}

export type Derivative = { width: number; body: Buffer }

export interface ImageCodec {
  load(): Promise<void>
  inspect(bytes: Buffer): Promise<ImageInspection>
  derive(bytes: Buffer, widths: readonly number[]): Promise<Derivative[]>
}

type SharpFactory = (input: Buffer, options: SharpOptions) => Sharp

let loading: Promise<SharpFactory> | null = null

// sharp, loaded once, with only the three image loaders allowed.
export function loadSharp(): Promise<SharpFactory> {
  loading ??= import('sharp')
    .then(({ default: sharp }) => {
      sharp.block({ operation: ['VipsForeignLoad'] })
      sharp.unblock({ operation: [...IMAGE_LOADERS] })
      sharp.cache(false)
      sharp.concurrency(1)
      return sharp as unknown as SharpFactory
    })
    .catch((error: unknown) => {
      loading = null
      throw error
    })
  return loading
}

const OPEN: SharpOptions = { limitInputPixels: MAX_IMAGE_PIXELS, failOn: 'warning' }

export const sharpImageCodec: ImageCodec = {
  async load() {
    await loadSharp()
  },

  async inspect(bytes) {
    const sharp = await loadSharp()
    const metadata = await sharp(bytes, OPEN).metadata()
    return {
      format: metadata.format,
      width: metadata.autoOrient.width,
      height: metadata.autoOrient.height,
      interlaced: metadata.isProgressive === true,
    }
  },

  async derive(bytes, widths) {
    const sharp = await loadSharp()
    const derivatives: Derivative[] = []
    // One image at a time, one width at a time: the worker's memory holds one decode (11 §13.2).
    for (const width of widths) {
      const body = await sharp(bytes, OPEN)
        .autoOrient()
        .toColourspace('srgb')
        .resize({ width, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
      derivatives.push({ width, body })
    }
    return derivatives
  },
}
