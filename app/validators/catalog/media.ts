import vine from '@vinejs/vine'
import { PRODUCT_MEDIA_LIMITS } from '#shared/constants/limits'
import { clearableNfcText } from '#validators/support/nfc_text'

/*
 * `replaceProductMedia` (docs/06 §13.5; `ReplaceProductMediaRequest` in
 * openapi.yaml; R1-S part 2d-iii). `items` is the whole gallery, at most 12
 * (04a §7.14); anything else, top-level or in an item, is refused with
 * `unknown_field` before this runs (`assertKnownMembers`,
 * `assertKnownItemMembers`, T-SEC-003). Each item:
 *
 * - `media_asset_id`: a UUID;
 * - `position`: an integer from 1 to 12 (`product_media_position_check`);
 * - `alt_text`: up to 150 characters, or null: trimmed and NFC-normalised,
 *   counted in code points as the column's CHECK counts them, and a blank
 *   is null (06 §3.5, `clearableNfcText`), which the storefront replaces
 *   with "{title}, {colour}" (AC-FR-MED-002-2);
 * - `color_value_id`: a UUID or null, optional.
 *
 * The positions as a set, repeats, the colours and the assets are the
 * action's checks, on the request's paths.
 */
export const PRODUCT_MEDIA_MEMBERS = ['items'] as const

export const PRODUCT_MEDIA_ITEM_MEMBERS = [
  'media_asset_id',
  'position',
  'alt_text',
  'color_value_id',
] as const

export const replaceProductMediaValidator = vine.create({
  items: vine
    .array(
      vine.object({
        media_asset_id: vine.string().uuid(),
        position: vine
          .number({ strict: true })
          .withoutDecimals()
          .min(1)
          .max(PRODUCT_MEDIA_LIMITS.items.max),
        alt_text: clearableNfcText(PRODUCT_MEDIA_LIMITS.altText).nullable(),
        color_value_id: vine.string().uuid().nullable().optional(),
      })
    )
    .maxLength(PRODUCT_MEDIA_LIMITS.items.max),
})
