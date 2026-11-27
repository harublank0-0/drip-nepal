import { useCallback, useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import type { Problem } from '@shared/api/problem'
import {
  LIVE_PRODUCT_STATUSES,
  type AttributeOption,
  type SellerProduct,
} from '@shared/ui/product_details'
import {
  afterSave,
  altFallback,
  altProblem,
  colorOptions,
  colourGone,
  colourLabel,
  galleryBody,
  galleryFrom,
  moveItem,
  placeErrors,
  sameGallery,
  type GalleryItem,
  type ItemErrors,
} from '@shared/ui/product_media'
import { PRODUCT_MEDIA_LIMITS } from '@shared/constants/limits'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { announce } from '~/lib/announce'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { TextField } from '~/components/forms/text_field'
import { ChoiceField } from '~/components/forms/choice_field'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { ImageUploader, type ReadyImage } from '~/components/seller/image_uploader'
import { PhotoThumb } from '~/components/seller/photo_thumb'

/*
 * The product editor's photos (docs/08 §2.5 `/products/{productId}`, §4.3;
 * 02 J-10 step 5; R1-S part 2g-ii): the gallery in its order, each image
 * with optional alt text (AC-FR-MED-002-2: an empty one shows the text the
 * storefront uses instead) and, when the product varies by colour, the
 * colour it shows (`colorOptions`), moved with "Move up" and "Move down"
 * (focus stays on the moved image's button, SC 2.5.7) and removed with
 * "Remove". The first image is the product's main photo. New files go
 * through `ImageUploader`; each ready image joins the gallery, unsaved,
 * after the others.
 *
 * "Save photos" sends the whole gallery to `replaceProductMedia` ⟳ with
 * `If-Match` of the newest product the page knows (`base`, as the details
 * and variants forms do), so saving another section first never looks like
 * someone else's change; it waits while a file is still on its way. A live
 * product keeps at least one image (`required`), and an image may name only
 * a colour the product still has. Errors follow 08 §7.1: a field's message
 * clears as it is fixed, and a submit with two or more errors, any error on
 * a gallery of two or more images, or a form-level message shows the error
 * summary and focuses it. A 412 says whether the saved photos changed or
 * only the rest of the product, and offers 08 §7.1's "Keep my changes" (on
 * the newer version) or "Discard mine and reload". The items follow a newer
 * product only while the seller has changed nothing.
 */
const RATE_LIMIT_ID = 'photos-rate-limit'
const WAIT_ID = 'photos-wait'
const SUMMARY_ID = 'photos-errors'
const SAVE_ID = 'photos-save'
const NO_COLOUR = '__no_colour__'

const itemId = (assetId: string, part: string) => `photo-${assetId}-${part}`

function conflictProduct(problem: Problem): SellerProduct | null {
  const current = problem.current
  return typeof current === 'object' && current !== null && 'version' in current
    ? (current as SellerProduct)
    : null
}

export function ProductPhotosForm({
  shopSlug,
  product,
  attributes,
  mediaBase,
  onSaved,
  onDirtyChange,
}: {
  shopSlug: string
  product: SellerProduct
  attributes: AttributeOption[]
  mediaBase: string
  onSaved?: (next: SellerProduct) => void
  onDirtyChange?: (dirty: boolean) => void
}) {
  const mutation = useApiMutation()
  // The newest product known: the props, or what a save or discard returned before they caught up.
  const [latest, setLatest] = useState<SellerProduct | null>(null)
  const base = latest && latest.version > product.version ? latest : product
  const [items, setItems] = useState<GalleryItem[]>(() => galleryFrom(product))
  // The product the items were taken from: they follow a newer one only while nothing is changed.
  const [itemsFrom, setItemsFrom] = useState(product)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [uploading, setUploading] = useState(false)
  const [itemErrors, setItemErrors] = useState<Record<string, ItemErrors>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [summaryShown, setSummaryShown] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [conflict, setConflict] = useState<SellerProduct | null>(null)
  const [done, setDone] = useState(false)
  const [focusTarget, setFocusTarget] = useState<{ id: string; turn: number } | null>(null)
  const previewsRef = useRef(previews)
  // The gallery now, for a save's answer, which arrives after renders the save's closure missed.
  const itemsRef = useRef(items)
  useEffect(() => {
    previewsRef.current = previews
    itemsRef.current = items
  })

  const edited = !sameGallery(items, itemsFrom)
  if (base !== itemsFrom && base.version > itemsFrom.version && !edited) {
    setItemsFrom(base)
    setItems(galleryFrom(base))
  }
  const dirty = !sameGallery(items, base)

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus()
  }, [focusTarget])

  // Previews are revoked when the form goes away; each is revoked earlier when its image goes.
  useEffect(
    () => () => {
      for (const url of Object.values(previewsRef.current)) URL.revokeObjectURL(url)
    },
    []
  )

  const live = LIVE_PRODUCT_STATUSES.includes(base.status)
  const colours = colorOptions(base, attributes)

  const focusAfter = useCallback((id: string) => {
    setFocusTarget((previous) => ({ id, turn: (previous?.turn ?? 0) + 1 }))
  }, [])

  const onReady = useCallback(
    (image: ReadyImage) => {
      setItems((list) => [
        ...list,
        { assetId: image.assetId, keys: image.keys, alt: image.alt, colorValueId: null },
      ])
      setPreviews((map) => ({ ...map, [image.assetId]: image.preview }))
      setDone(false)
      // The seller was writing its alt text: the gallery's field takes over.
      if (image.focused) focusAfter(itemId(image.assetId, 'alt'))
    },
    [focusAfter]
  )

  // Revokes the previews of `assetIds` and forgets them.
  function dropPreviews(assetIds: (id: string) => boolean) {
    setPreviews((map) => {
      const rest: Record<string, string> = {}
      for (const [assetId, url] of Object.entries(map)) {
        if (assetIds(assetId)) URL.revokeObjectURL(url)
        else rest[assetId] = url
      }
      return rest
    })
  }

  function setErrorsOf(assetId: string, change: ItemErrors) {
    setItemErrors((map) => {
      const next = { ...map[assetId], ...change }
      const kept = Object.fromEntries(Object.entries(next).filter(([, value]) => value))
      const rest = Object.fromEntries(Object.entries(map).filter(([id]) => id !== assetId))
      return Object.keys(kept).length > 0 ? { ...rest, [assetId]: kept } : rest
    })
  }

  const altMessage = () =>
    t('seller.photos.alt_too_long', { max: PRODUCT_MEDIA_LIMITS.altText.max })

  function update(index: number, change: Partial<GalleryItem>) {
    const item = { ...items[index], ...change }
    setItems((list) => list.map((old, at) => (at === index ? item : old)))
    setDone(false)
    // A field showing an error is checked again as the seller types (08 §7.1).
    const shown = itemErrors[item.assetId]
    if (shown?.alt && change.alt !== undefined) {
      setErrorsOf(item.assetId, { alt: altProblem(item.alt) ? altMessage() : undefined })
    }
    if (shown?.colour && change.colorValueId !== undefined) {
      setErrorsOf(item.assetId, {
        colour: colourGone(item, colours) ? t('seller.photos.colour_gone') : undefined,
      })
    }
  }

  function move(index: number, delta: -1 | 1) {
    const assetId = items[index].assetId
    const next = moveItem(items, index, delta)
    setItems(next)
    setDone(false)
    // The same button of the moved image, or the other one when it reached an end.
    const at = next.findIndex((item) => item.assetId === assetId)
    const part = delta === -1 ? (at === 0 ? 'down' : 'up') : at === next.length - 1 ? 'up' : 'down'
    focusAfter(itemId(assetId, next.length === 1 ? 'remove' : part))
  }

  function remove(index: number) {
    const removed = items[index]
    const next = items.filter((_item, at) => at !== index)
    setItems(next)
    setDone(false)
    setErrorsOf(removed.assetId, { alt: undefined, colour: undefined, asset: undefined })
    dropPreviews((assetId) => assetId === removed.assetId)
    // The next image's "Remove", or the heading when none is left (08 §9.1 "Item removed").
    const neighbour = next[Math.min(index, next.length - 1)]
    focusAfter(neighbour ? itemId(neighbour.assetId, 'remove') : 'photos-heading')
    announce(t('seller.photos.announce_removed_photo', { position: index + 1 }))
  }

  // Shows the errors found: the summary, or focus on the one field (08 §7.1).
  function report(found: Record<string, ItemErrors>, formLevel: string[]) {
    setItemErrors(found)
    setFormErrors(formLevel)
    const gallery = itemsRef.current
    const fields = gallery.flatMap((item) =>
      (['alt', 'colour', 'asset'] as const)
        .filter((part) => found[item.assetId]?.[part])
        .map((part) => itemId(item.assetId, part === 'asset' ? 'remove' : part))
    )
    const count = fields.length + formLevel.length
    if (count === 0) return
    const summary = formLevel.length > 0 || fields.length > 1 || gallery.length > 1
    setSummaryShown(summary)
    focusAfter(summary ? SUMMARY_ID : fields[0])
  }

  function check(): boolean {
    const found: Record<string, ItemErrors> = {}
    for (const item of items) {
      const errors: ItemErrors = {}
      if (altProblem(item.alt)) errors.alt = altMessage()
      if (colourGone(item, colours)) errors.colour = t('seller.photos.colour_gone')
      if (Object.keys(errors).length > 0) found[item.assetId] = errors
    }
    const formLevel = live && items.length === 0 ? [t('seller.photos.need_one')] : []
    report(found, formLevel)
    return Object.keys(found).length === 0 && formLevel.length === 0
  }

  async function save() {
    if (mutation.pending || uploading) return
    setProblem(null)
    setOffline(false)
    setDone(false)
    setSummaryShown(false)
    if (!check()) return
    const sent = items
    const hadConflict = conflict !== null
    const version = conflict?.version ?? base.version
    const outcome = await mutation.run(() =>
      client.request('replaceProductMedia', {
        params: { shopSlug, productId: base.id },
        body: galleryBody(sent),
        headers: { 'If-Match': `"${version}"` },
        timeout: 30_000,
      })
    )
    if (!outcome) return
    if (outcome.ok) {
      const next = outcome.data.data as SellerProduct
      const sentIds = new Set(sent.map((item) => item.assetId))
      setConflict(null)
      setLatest(next)
      setItemsFrom(next)
      setItems((current) => afterSave(next, current, sentIds))
      // The processed images show now; the previews of the images saved go.
      dropPreviews((assetId) => sentIds.has(assetId))
      setDone(true)
      onSaved?.(next)
      // "Keep my changes" leaves with the conflict panel; focus returns to Save.
      if (hadConflict) focusAfter(SAVE_ID)
      router.reload({ only: ['product'] })
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    const found = outcome.problem
    if (found.code === 'RATE_LIMITED' || found.code === 'UNAUTHENTICATED') return
    if (found.code === 'VERSION_CONFLICT') {
      const current = conflictProduct(found)
      if (current) {
        setConflict(current)
        focusAfter('photos-conflict')
        return
      }
    }
    if (found.code === 'VALIDATION_FAILED' && found.errors?.length) {
      // Messages for images no longer in the gallery are form-level.
      const placed = placeErrors(found.errors, sent)
      const here = new Set(itemsRef.current.map((item) => item.assetId))
      const formLevel = [...placed.formLevel]
      const onItems: Record<string, ItemErrors> = {}
      for (const [assetId, errors] of Object.entries(placed.items)) {
        if (here.has(assetId)) onItems[assetId] = errors
        else formLevel.push(...Object.values(errors).filter((value) => value !== undefined))
      }
      report(onItems, formLevel)
      return
    }
    setProblem(found)
    if (found.code === 'SHOP_NOT_ACTIVE' || found.code === 'INVALID_STATE_TRANSITION') {
      router.reload()
    }
  }

  function discard() {
    if (!conflict) return
    const keep = new Set(conflict.media.map((item) => item.media_asset_id))
    dropPreviews((assetId) => !keep.has(assetId))
    setLatest(conflict)
    setItemsFrom(conflict)
    setItems(galleryFrom(conflict))
    setItemErrors({})
    setFormErrors([])
    setSummaryShown(false)
    setConflict(null)
    onSaved?.(conflict)
    focusAfter('photos-heading')
    router.reload({ only: ['product'] })
  }

  const blocked = mutation.pending || mutation.retryIn > 0 || uploading
  const describedBy =
    [mutation.retryIn > 0 ? RATE_LIMIT_ID : null, uploading ? WAIT_ID : null]
      .filter(Boolean)
      .join(' ') || undefined
  const summaryEntries = [
    ...items.flatMap((item, index) =>
      (['alt', 'colour', 'asset'] as const)
        .filter((part) => itemErrors[item.assetId]?.[part])
        .map((part) => ({
          target: itemId(item.assetId, part === 'asset' ? 'remove' : part),
          message: t('seller.photos.error_entry', {
            position: index + 1,
            message: itemErrors[item.assetId]![part]!,
          }),
        }))
    ),
    ...formErrors.map((message) => ({ target: null, message })),
  ]

  return (
    <div className="space-y-5">
      {summaryShown && summaryEntries.length > 0 && (
        <div
          id={SUMMARY_ID}
          tabIndex={-1}
          role="alert"
          className="border-destructive space-y-1 rounded-md border p-3 text-sm outline-none"
        >
          <p className="font-medium">
            {t('common.form.error_summary', { count: summaryEntries.length })}
          </p>
          <ul className="ml-4 list-disc">
            {summaryEntries.map((entry, index) => (
              <li key={`${entry.target ?? 'form'}-${index}`}>
                {entry.target ? (
                  <a
                    href={`#${entry.target}`}
                    className="text-link underline underline-offset-4"
                    onClick={(event) => {
                      event.preventDefault()
                      document.getElementById(entry.target!)?.focus()
                    }}
                  >
                    {entry.message}
                  </a>
                ) : (
                  entry.message
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('seller.photos.none')}</p>
      ) : (
        <ol className="space-y-3" aria-label={t('seller.photos.gallery_label')}>
          {items.map((item, index) => {
            const errors = itemErrors[item.assetId] ?? {}
            const position = t('seller.photos.position', { position: index + 1 })
            const gone = colourGone(item, colours)
            const label = colourLabel(attributes, item.colorValueId)
            return (
              <li
                key={item.assetId}
                className="grid gap-3 rounded-md border p-3 sm:grid-cols-[6rem_1fr]"
              >
                <div className="space-y-1">
                  <PhotoThumb
                    keys={item.keys}
                    mediaBase={mediaBase}
                    preview={previews[item.assetId]}
                    alt=""
                    sizes="96px"
                    className="aspect-square w-24 rounded object-cover"
                  />
                  <p className="text-sm font-medium">
                    {position}
                    {index === 0 && (
                      <span className="text-muted-foreground block text-xs">
                        {t('seller.photos.main')}
                      </span>
                    )}
                  </p>
                </div>
                <div className="space-y-3">
                  {errors.asset && <p className="text-destructive text-sm">{errors.asset}</p>}
                  <TextField
                    id={itemId(item.assetId, 'alt')}
                    label={t('seller.photos.alt', { position })}
                    description={
                      item.alt.trim() === ''
                        ? t('seller.photos.alt_missing', {
                            fallback: altFallback(base.title, gone ? null : label),
                          })
                        : t('seller.photos.alt_help')
                    }
                    value={item.alt}
                    errors={errors.alt ? [errors.alt] : []}
                    onChange={(value) => update(index, { alt: value })}
                    onBlur={() => undefined}
                  />
                  {(colours.length > 0 || gone) && (
                    <ChoiceField
                      id={itemId(item.assetId, 'colour')}
                      label={t('seller.photos.colour', { position })}
                      value={item.colorValueId ?? NO_COLOUR}
                      options={[
                        { value: NO_COLOUR, label: t('seller.photos.no_colour') },
                        ...colours.map((colour) => ({ value: colour.id, label: colour.label })),
                        // The colour it names, kept as a choice so the field shows it.
                        ...(gone && item.colorValueId
                          ? [
                              {
                                value: item.colorValueId,
                                label: t('seller.photos.colour_gone_option', {
                                  label: label ?? t('seller.photos.colour_unknown'),
                                }),
                              },
                            ]
                          : []),
                      ]}
                      errors={errors.colour ? [errors.colour] : []}
                      onChange={(value) =>
                        update(index, { colorValueId: value === NO_COLOUR ? null : value })
                      }
                    />
                  )}
                  <div className="flex flex-wrap gap-2">
                    {index > 0 && (
                      <Button
                        id={itemId(item.assetId, 'up')}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => move(index, -1)}
                      >
                        {t('seller.photos.move_up')}
                        <span className="sr-only"> {position}</span>
                      </Button>
                    )}
                    {index < items.length - 1 && (
                      <Button
                        id={itemId(item.assetId, 'down')}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => move(index, 1)}
                      >
                        {t('seller.photos.move_down')}
                        <span className="sr-only"> {position}</span>
                      </Button>
                    )}
                    <Button
                      id={itemId(item.assetId, 'remove')}
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                    >
                      {t('seller.photos.remove')}
                      <span className="sr-only"> {position}</span>
                    </Button>
                  </div>
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <ImageUploader
        shopSlug={shopSlug}
        galleryCount={items.length}
        onReady={onReady}
        onBusyChange={setUploading}
      />

      {conflict && (
        <Alert id="photos-conflict" role="alert" tabIndex={-1} className="outline-none">
          <AlertTitle>{t('seller.photos.conflict_title')}</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{t('seller.photos.conflict_body')}</p>
            <p>
              {sameGallery(galleryFrom(itemsFrom), conflict)
                ? t('seller.photos.conflict_elsewhere')
                : t('seller.photos.conflict_photos')}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                aria-disabled={blocked || undefined}
                aria-describedby={describedBy}
                className={PENDING_BUTTON}
                onClick={() => void save()}
              >
                {t('seller.photos.keep_mine')}
              </Button>
              <Button type="button" variant="outline" onClick={discard}>
                {t('seller.photos.discard_mine')}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <ProblemAlert problem={problem} offline={offline} />
      {uploading && (
        <p id={WAIT_ID} className="text-muted-foreground text-sm">
          {t('seller.photos.wait_uploads')}
        </p>
      )}
      {done && !dirty && (
        <p role="status" className="text-sm">
          {t('seller.photos.saved')}
        </p>
      )}
      {!conflict && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            id={SAVE_ID}
            type="button"
            className={`h-11 text-base md:h-9 md:text-sm ${PENDING_BUTTON}`}
            aria-disabled={blocked || undefined}
            aria-describedby={describedBy}
            onClick={() => void save()}
          >
            {mutation.pending ? t('seller.photos.saving') : t('seller.photos.save')}
          </Button>
        </div>
      )}
      <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
    </div>
  )
}
