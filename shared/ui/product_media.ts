import { MEDIA_UPLOAD_LIMITS, PRODUCT_MEDIA_LIMITS } from '../constants/limits.js'
import type { AttributeOption, SellerProduct } from './product_details.js'
import type { ProblemItem } from '../api/problem.js'

/*
 * The product editor's gallery (docs/08 §2.5 `/products/{productId}`, §4.3
 * `ImageUploader`; 02 J-10 step 5; 06 §13.5 `replaceProductMedia`; R1-S part
 * 2g-ii), pure so the form and its tests share the rules.
 *
 * A gallery item is a `ready` image: saved already, or uploaded in this
 * session and not saved yet. Its alt text is optional (AC-FR-MED-002-2, at
 * most 150 characters); its colour, when the product varies by colour, is
 * one of its active variants' colours, so the storefront shows the image
 * for that colour (08 §11.2). Saving sends the whole ordered gallery, as
 * `replaceProductMedia` takes it.
 */
export type GalleryItem = {
  assetId: string
  // The public derivatives by width; null when the asset is not `ready`, which a gallery item is.
  keys: Record<string, string> | null
  alt: string
  colorValueId: string | null
}

export const MAX_GALLERY = PRODUCT_MEDIA_LIMITS.items.max

export function galleryFrom(product: Pick<SellerProduct, 'media'>): GalleryItem[] {
  return [...product.media]
    .sort((a, b) => a.position - b.position)
    .map((item) => ({
      assetId: item.media_asset_id,
      keys: item.keys,
      alt: item.alt_text ?? '',
      colorValueId: item.color_value_id,
    }))
}

// The `replaceProductMedia` body: positions 1 to n in gallery order; a blank alt text is none.
export function galleryBody(items: readonly GalleryItem[]) {
  return {
    items: items.map((item, index) => {
      const alt = item.alt.trim()
      return {
        media_asset_id: item.assetId,
        position: index + 1,
        alt_text: alt === '' ? null : alt,
        color_value_id: item.colorValueId,
      }
    }),
  }
}

// Whether `items` would save what `product` already holds: the same images, order, text and colours.
export function sameGallery(items: readonly GalleryItem[], product: Pick<SellerProduct, 'media'>) {
  return JSON.stringify(galleryBody(items)) === JSON.stringify(galleryBody(galleryFrom(product)))
}

// `items` with the item at `index` moved by `delta` places, or unchanged at either end.
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta
  if (target < 0 || target >= items.length) return [...items]
  const next = [...items]
  const [moved] = next.splice(index, 1)
  next.splice(target, 0, moved)
  return next
}

/*
 * The colours an image may be linked to: the `color` values of the
 * product's active variants, in the attribute's order (`replaceProductMedia`
 * refuses any other with `not_allowed`). None when the product does not vary
 * by colour.
 */
export function colorOptions(
  product: Pick<SellerProduct, 'variants'>,
  attributes: readonly AttributeOption[]
): { id: string; label: string }[] {
  const used = new Set(
    product.variants
      .filter((variant) => variant.status === 'active')
      .map((variant) => variant.option_value_codes.color)
      .filter((code): code is string => typeof code === 'string')
  )
  const color = attributes.find((attribute) => attribute.code === 'color')
  return (color?.values ?? [])
    .filter((value) => used.has(value.code))
    .map((value) => ({ id: value.id, label: value.label }))
}

/*
 * What the storefront says for an image with no alt text (01
 * AC-FR-MED-002-2, 04a §7.14): "{title}, {colour}" with the colour it shows,
 * or the title alone; the seller sees it as a warning under an empty field.
 */
export function altFallback(title: string, colour: string | null) {
  return colour === null ? title : `${title}, ${colour}`
}

// The label of the colour value `id`, or null for none or one the choices no longer hold.
export function colourLabel(attributes: readonly AttributeOption[], id: string | null) {
  if (id === null) return null
  const color = attributes.find((attribute) => attribute.code === 'color')
  return color?.values.find((value) => value.id === id)?.label ?? null
}

export type FileProblem = 'type' | 'size'

// Why a chosen file cannot be uploaded, before any request: its type, or its size (06 §9.2).
export function fileProblem(file: { type: string; size: number }): FileProblem | null {
  if (!(MEDIA_UPLOAD_LIMITS.imageTypes as readonly string[]).includes(file.type)) return 'type'
  if (file.size < 1 || file.size > MEDIA_UPLOAD_LIMITS.maxBytes) return 'size'
  return null
}

// An alt text's problem: at most 150 characters, counted in code points as the database counts them.
export function altProblem(text: string): 'too_long' | null {
  return [...text.trim()].length > PRODUCT_MEDIA_LIMITS.altText.max ? 'too_long' : null
}

// Room left for new images: the gallery's limit less the images kept and those still uploading.
export function roomLeft(galleryCount: number, uploadingCount: number) {
  return Math.max(0, MAX_GALLERY - galleryCount - uploadingCount)
}

// The size limit in whole megabytes of 1,048,576 bytes, as the seller reads it.
export function maxUploadMegabytes() {
  return Math.floor(MEDIA_UPLOAD_LIMITS.maxBytes / 1_048_576)
}

/*
 * Whether an image names a colour none of the product's active variants has
 * any longer (its variants changed after the image was linked), which
 * `replaceProductMedia` refuses with `not_allowed`: the seller picks another
 * colour or none.
 */
export function colourGone(
  item: Pick<GalleryItem, 'colorValueId'>,
  colours: readonly { id: string }[]
) {
  return item.colorValueId !== null && !colours.some((colour) => colour.id === item.colorValueId)
}

export type ItemErrors = { alt?: string; colour?: string; asset?: string }

const ITEM_FIELD = /^items\.(\d+)\.(alt_text|color_value_id|media_asset_id)$/
const ITEM_PART = { alt_text: 'alt', color_value_id: 'colour', media_asset_id: 'asset' } as const

/*
 * A 422's `errors[]` placed on the images that were sent (08 §7.1): an
 * `items.N.<field>` message goes under the Nth image sent, by its asset ID,
 * so it stays with the image when the gallery is reordered; any other
 * message, including a field the form does not have, is form-level.
 */
export function placeErrors(
  errors: readonly ProblemItem[],
  sent: readonly Pick<GalleryItem, 'assetId'>[]
): { items: Record<string, ItemErrors>; formLevel: string[] } {
  const items: Record<string, ItemErrors> = {}
  const formLevel: string[] = []
  for (const error of errors) {
    const match = error.field ? ITEM_FIELD.exec(error.field) : null
    const item = match ? sent[Number(match[1])] : undefined
    if (!match || !item) {
      formLevel.push(error.message)
      continue
    }
    const part = ITEM_PART[match[2] as keyof typeof ITEM_PART]
    items[item.assetId] = { ...items[item.assetId], [part]: error.message }
  }
  return { items, formLevel }
}

/*
 * The gallery after a save: the images as saved, then the images that
 * turned ready while the save ran, which it did not send, still unsaved.
 */
export function afterSave(
  saved: Pick<SellerProduct, 'media'>,
  current: readonly GalleryItem[],
  sentIds: ReadonlySet<string>
): GalleryItem[] {
  const kept = galleryFrom(saved)
  const keptIds = new Set(kept.map((item) => item.assetId))
  return [
    ...kept,
    ...current.filter((item) => !sentIds.has(item.assetId) && !keptIds.has(item.assetId)),
  ]
}
