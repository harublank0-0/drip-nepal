import { useCallback, useEffect, useRef, useState } from 'react'
import { Head, router } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { toast } from 'sonner'
import {
  productEditable,
  type AttributeOption,
  type BrandOption,
  type CategoryOption,
  type SellerProduct,
} from '@shared/ui/product_details'
import { productMoves, type ProductMove } from '@shared/ui/product_status'
import { catalogEditable } from '@shared/ui/shop_access'
import type { Problem } from '@shared/api/problem'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { StatusBadge } from '~/components/common/status_badge'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { ProductDetailsForm } from '~/components/seller/product_details_form'
import { ProductDetailsView } from '~/components/seller/product_details_view'
import {
  ArchiveDialog,
  MOVE_DONE,
  MoveButtons,
  moveProblemOf,
  sendMove,
} from '~/components/seller/product_moves'
import { ProductReadiness, type ReadinessItem } from '~/components/seller/product_readiness'
import { MAX_GALLERY } from '@shared/ui/product_media'
import { ProductPhotosForm } from '~/components/seller/product_photos_form'
import { ProductPhotosView } from '~/components/seller/product_photos_view'
import { ProductVariantsForm } from '~/components/seller/product_variants_form'
import { ProductVariantsSummary } from '~/components/seller/product_variants_summary'

/*
 * `/seller/{shopSlug}/products/{productId}` (docs/08 §2.5
 * `/products/{productId}` row; 02 J-10; R1-S part 2f-i), rendered in the
 * browser in the seller layout. Its props are the product as
 * `getShopProduct` answers it (`product`) and the form's choices
 * (app/controllers/seller/catalog/products_controller.ts).
 *
 * The header names the product, its status and its public ID. A rejected
 * product shows the moderator's reason (saving a change returns it to
 * draft, AC-FR-CAT-006-2). "Before this product can go live" lists what
 * `missing_for_submit` still names. The details are a form for a role with
 * `shop.products.edit`, in a shop that may change its catalogue
 * (`catalogEditable`), on a product that may be edited (`productEditable`):
 * the server's own rules. Anyone else reads the saved details, with a line
 * saying why they cannot be changed. The variants follow under the same
 * rule: the variant editor (R1-S part 2f-ii), or the variants as saved.
 * Both forms write the same product version, so each tells the page what a
 * save returned, and both build on the newest product known: a details
 * save followed at once by a variants save never looks like someone else's
 * change while the props are read again.
 *
 * The header offers the status moves the product allows to a role with
 * their permission while the shop may change its catalogue (`productMoves`;
 * R1-S part 2f-iii): publish, unpublish, archive (after a tier 1
 * confirmation) and restore. A move acts on the product as saved, so while
 * either form holds a change not saved yet, a move asks for a save first.
 * A move's product is adopted at once (its new version, so the forms'
 * next save sends the right `If-Match`) and the props are read again; a
 * toast confirms and focus goes to the first move the new status offers,
 * or the heading. A refused publish (422) lists the gate's items in
 * "Before this product can go live", focused, each linked to its fix. The
 * UI hides; the server decides (docs/08 §11.6).
 */
type Props = InertiaProps<{
  product: SellerProduct
  categories: CategoryOption[]
  attributes: AttributeOption[]
  brands: BrandOption[]
  // The public bucket's base URL for the gallery's images ('' when none is set up).
  media_base: string
}>

const moveId = (move: ProductMove) => `product-move-${move}`
const MOVE_RATE_LIMIT_ID = 'product-move-rate-limit'

// Why the details are read-only, or null when the form is offered.
function readOnlyReason(
  product: SellerProduct,
  current: NonNullable<Props['current_shop']>
): string | null {
  if (!can(current, 'shop.products.edit')) return t('seller.product.read_only_role')
  if (!catalogEditable(current.status)) return t('seller.product.read_only_shop')
  if (!productEditable(product.status)) {
    if (product.status === 'pending_review') return t('seller.product.read_only_review')
    if (product.status === 'archived') return t('seller.product.read_only_archived')
    return t('seller.product.read_only_blocked')
  }
  return null
}

export default function SellerProductEdit({
  product,
  categories,
  attributes,
  brands,
  media_base,
  current_shop: current,
}: Props) {
  // The product a save or a move returned, until the props catch up with it.
  const [latest, setLatest] = useState<SellerProduct | null>(null)
  const mutation = useApiMutation()
  const [pendingMove, setPendingMove] = useState<ProductMove | null>(null)
  const [moveProblem, setMoveProblem] = useState<Problem | null>(null)
  const [moveOffline, setMoveOffline] = useState(false)
  // The items of a refused publish, until a move or a save succeeds, or the page is opened again.
  const [refused, setRefused] = useState<ReadinessItem[] | null>(null)
  // Each press of a move while a change is not saved; 0 once nothing is unsaved.
  const [unsavedTurn, setUnsavedTurn] = useState(0)
  const [detailsDirty, setDetailsDirty] = useState(false)
  const [variantsDirty, setVariantsDirty] = useState(false)
  const [photosDirty, setPhotosDirty] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archived = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const readinessRef = useRef<HTMLHeadingElement>(null)
  const unsavedRef = useRef<HTMLDivElement>(null)
  // Where focus goes once a move's answer has rendered.
  const [focusTurn, setFocusTurn] = useState<{ to: 'moves' | 'readiness'; turn: number } | null>(
    null
  )

  const newest = latest && latest.version > product.version ? latest : product
  const moves = current
    ? productMoves(newest.status, current.status, (permission) => can(current, permission))
    : []

  useEffect(() => {
    if (!focusTurn) return
    if (focusTurn.to === 'readiness') {
      readinessRef.current?.focus()
      return
    }
    const first = moves.length > 0 ? document.getElementById(moveId(moves[0])) : null
    ;(first ?? headingRef.current)?.focus()
    // Runs once per answer: `moves` is read as that answer left it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTurn])

  useEffect(() => {
    if (unsavedTurn > 0) unsavedRef.current?.focus()
  }, [unsavedTurn])

  // A save of either form: its product is the newest, and a refusal's list may no longer hold.
  const adopt = useCallback((next: SellerProduct) => {
    setLatest(next)
    setRefused(null)
    setUnsavedTurn(0)
  }, [])

  // What each form last reported; once nothing is unsaved (saved or undone), the message goes
  // for good, so a later edit does not bring it back.
  const dirtyNow = useRef({ details: false, variants: false, photos: false })
  const reportDirty = useCallback((form: 'details' | 'variants' | 'photos', dirty: boolean) => {
    dirtyNow.current[form] = dirty
    if (form === 'details') setDetailsDirty(dirty)
    else if (form === 'variants') setVariantsDirty(dirty)
    else setPhotosDirty(dirty)
    const { details, variants, photos } = dirtyNow.current
    if (!details && !variants && !photos) setUnsavedTurn(0)
  }, [])
  const detailsDirtyChange = useCallback(
    (dirty: boolean) => reportDirty('details', dirty),
    [reportDirty]
  )
  const variantsDirtyChange = useCallback(
    (dirty: boolean) => reportDirty('variants', dirty),
    [reportDirty]
  )
  const photosDirtyChange = useCallback(
    (dirty: boolean) => reportDirty('photos', dirty),
    [reportDirty]
  )

  if (!current) return null
  const reason = readOnlyReason(newest, current)
  const unsaved = reason === null && (detailsDirty || variantsDirty || photosDirty)
  const nameOf = (code: string) => attributes.find((attribute) => attribute.code === code)?.name

  function focusAfter(to: 'moves' | 'readiness') {
    setFocusTurn((previous) => ({ to, turn: (previous?.turn ?? 0) + 1 }))
  }

  function chooseMove(move: ProductMove) {
    setMoveProblem(null)
    setMoveOffline(false)
    if (unsaved) {
      setUnsavedTurn((previous) => previous + 1)
      return
    }
    setUnsavedTurn(0)
    if (move === 'archive') {
      archived.current = false
      setArchiveOpen(true)
      return
    }
    void runMove(move)
  }

  async function runMove(move: ProductMove) {
    if (!current) return
    setPendingMove(move)
    const outcome = await mutation.run(sendMove(current.slug, newest.id, move))
    setPendingMove(null)
    if (!outcome) return
    if (outcome.ok) {
      setLatest(outcome.data.data)
      setRefused(null)
      if (move === 'archive') {
        archived.current = true
        setArchiveOpen(false)
      }
      toast.success(t(MOVE_DONE[move], { title: newest.title }))
      router.reload({ only: ['product'] })
      if (move !== 'archive') focusAfter('moves')
      return
    }
    // useApiMutation shows the wait next to the buttons, and in the archive dialog.
    if ('problem' in outcome && outcome.problem.code === 'RATE_LIMITED') return
    // A failure closes the archive dialog; the page says why, by the buttons.
    setArchiveOpen(false)
    if ('offline' in outcome) {
      setMoveOffline(true)
      return
    }
    const found = outcome.problem
    if (found.code === 'VALIDATION_FAILED' && found.errors?.length) {
      setRefused(
        found.errors.map((item) => ({
          field: item.field ?? '',
          code: item.code,
          message: item.message,
        }))
      )
      focusAfter('readiness')
      return
    }
    setMoveProblem(moveProblemOf(found))
    // Moved elsewhere, or the shop's status changed: the page catches up.
    if (found.code === 'INVALID_STATE_TRANSITION') router.reload({ only: ['product'] })
    if (found.code === 'SHOP_NOT_ACTIVE') router.reload()
  }
  return (
    <>
      <Head title={t('seller.product.page_title', { title: newest.title, name: current.name })} />
      <div className="max-w-3xl space-y-8">
        <div className="space-y-4">
          <Link
            route="seller.products"
            routeParams={{ shopSlug: current.slug }}
            className="text-link text-sm underline-offset-4 hover:underline"
          >
            {t('seller.product.back')}
          </Link>
          <header className="space-y-2">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight break-words outline-none md:text-3xl"
            >
              {newest.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <StatusBadge entity="product" state={newest.status} />
              <span className="text-muted-foreground">
                {t('seller.product.public_id', { id: product.public_id })}
              </span>
            </div>
          </header>
          {moves.length > 0 && (
            <div className="flex flex-wrap gap-3">
              <MoveButtons
                moves={moves}
                idOf={moveId}
                pending={pendingMove}
                blocked={mutation.pending || mutation.retryIn > 0}
                describedBy={mutation.retryIn > 0 ? MOVE_RATE_LIMIT_ID : undefined}
                onMove={chooseMove}
              />
            </div>
          )}
          <RateLimitNotice id={MOVE_RATE_LIMIT_ID} seconds={mutation.retryIn} />
          {unsavedTurn > 0 && unsaved && (
            <Alert role="alert" ref={unsavedRef} tabIndex={-1} className="outline-none">
              <AlertDescription>{t('seller.product.move.save_first')}</AlertDescription>
            </Alert>
          )}
          <ProblemAlert problem={moveProblem} offline={moveOffline} entity="product" />
          {newest.status === 'rejected' && (
            <Alert role="status">
              <AlertTitle>{t('seller.product.rejected_title')}</AlertTitle>
              <AlertDescription>
                <p className="whitespace-pre-line">
                  {newest.rejection_reason ?? t('seller.product.rejected_no_reason')}
                </p>
                <p>{t('seller.product.rejected_help')}</p>
              </AlertDescription>
            </Alert>
          )}
          {reason && (
            <Alert role="status">
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          )}
        </div>

        <ProductReadiness
          product={newest}
          refused={refused}
          editable={reason === null}
          shopSlug={current.slug}
          nameOf={nameOf}
          headingRef={readinessRef}
        />

        <section aria-labelledby="product-details-heading" className="space-y-4">
          <h2
            id="product-details-heading"
            className="font-heading text-xl font-semibold tracking-tight"
          >
            {t('seller.product.details_heading')}
          </h2>
          {reason ? (
            <ProductDetailsView product={newest} categories={categories} attributes={attributes} />
          ) : (
            <ProductDetailsForm
              shopSlug={current.slug}
              product={newest}
              categories={categories}
              attributes={attributes}
              brands={brands}
              onSaved={adopt}
              onDirtyChange={detailsDirtyChange}
            />
          )}
        </section>

        <section aria-labelledby="product-variants-heading" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="product-variants-heading"
              tabIndex={-1}
              className="font-heading text-xl font-semibold tracking-tight outline-none"
            >
              {t('seller.product.variants.heading')}
            </h2>
            <p className="text-muted-foreground text-sm">{t('seller.product.variants.intro')}</p>
          </div>
          {reason ? (
            <ProductVariantsSummary variants={newest.variants} />
          ) : (
            <ProductVariantsForm
              shopSlug={current.slug}
              product={newest}
              categories={categories}
              attributes={attributes}
              onSaved={adopt}
              onDirtyChange={variantsDirtyChange}
            />
          )}
        </section>

        <section aria-labelledby="photos-heading" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="photos-heading"
              tabIndex={-1}
              className="font-heading text-xl font-semibold tracking-tight outline-none"
            >
              {t('seller.photos.heading')}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t('seller.photos.intro', { max: MAX_GALLERY })}
            </p>
          </div>
          {reason ? (
            <ProductPhotosView product={newest} attributes={attributes} mediaBase={media_base} />
          ) : (
            <ProductPhotosForm
              shopSlug={current.slug}
              product={newest}
              attributes={attributes}
              mediaBase={media_base}
              onSaved={adopt}
              onDirtyChange={photosDirtyChange}
            />
          )}
        </section>
      </div>
      <ArchiveDialog
        title={newest.title}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        pending={pendingMove === 'archive'}
        retryIn={mutation.retryIn}
        onConfirm={() => void runMove('archive')}
        onCloseAutoFocus={(event) => {
          // Back to Archive when cancelled; after an archive, to Restore, or the heading.
          event.preventDefault()
          const target = archived.current ? moveId('restore') : moveId('archive')
          ;(document.getElementById(target) ?? headingRef.current)?.focus()
        }}
      />
    </>
  )
}
