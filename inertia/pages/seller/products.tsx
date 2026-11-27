import { useEffect, useRef, useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { toast } from 'sonner'
import type { Problem } from '@shared/api/problem'
import { productMoves, type ProductMove } from '@shared/ui/product_status'
import { catalogEditable } from '@shared/ui/shop_access'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { EmptyState } from '~/components/common/empty_state'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'
import { ProductFilters } from '~/components/seller/product_filters'
import {
  ArchiveDialog,
  MOVE_DONE,
  MoveMenu,
  moveProblemOf,
  sendMove,
} from '~/components/seller/product_moves'
import { ReadinessItems, type ReadinessItem } from '~/components/seller/product_readiness'
import { ProductsTable, type ProductListItem } from '~/components/seller/products_table'

/*
 * `/seller/{shopSlug}/products` (docs/08 §2.5 `/products` row, §7.2; 02
 * J-10 entry point; R1-S part 2f-i), rendered in the browser in the seller
 * layout. Its props are one cursor page of `listShopProducts` (`products`)
 * and the filters the server read from the URL (`filters`), so the filter
 * controls show the list's real state
 * (app/controllers/seller/catalog/products_controller.ts).
 *
 * "Add product" shows for a role with `shop.products.edit` while the shop
 * may change its catalogue (`catalogEditable`, the server's own gate). With
 * no product at all the page says how to start; with filters that match
 * nothing it offers to clear them (02 J-10 "Empty"). Cursors only go
 * forward: "Next page", and "Back to the first page" on a later page, each
 * keeping the filters (08 §7.2).
 *
 * Each row offers the status moves its product allows to a role with their
 * permission while the shop may change its catalogue (`productMoves`; R1-S
 * part 2f-iii), in one menu button named with the row (08 §7.2); a role
 * with neither move permission gets no Actions column. Archiving asks
 * first (tier 1, 08 §7.3). After a move a toast confirms, the row shows
 * the status the move answered at once, the `products` prop is read again,
 * and focus goes back to the row's menu button, or to the heading when the
 * row left the list or offers no move (08 §7.3 rule 1). A refused publish
 * names the product, lists the gate's items and links to its editor; any
 * other failure shows above the list, and a move another tab made first
 * reloads the list. The moves share one request in flight and one
 * `RATE_LIMITED` wait.
 */
type Props = InertiaProps<{
  products: { items: ProductListItem[]; meta: { limit: number; next_cursor: string | null } }
  filters: { status: string | null; q: string | null }
}>

// A row's actions menu button; the table and the cards each render one.
const actionsId = (productId: string, layout: 'table' | 'card') =>
  `product-${productId}-actions-${layout}`
const RATE_LIMIT_ID = 'products-move-rate-limit'

// The row's visible actions button (the table's or the card's, by the screen's width).
function visibleActions(productId: string) {
  const buttons = document.querySelectorAll<HTMLElement>(`[data-move-row="${productId}"]`)
  return [...buttons].find((button) => button.offsetParent !== null) ?? null
}

export default function SellerProducts({ products, filters, current_shop: current }: Props) {
  // A later page carries a cursor in its URL; 08 §7.2 offers the way back.
  const onLaterPage = usePage().url.includes('cursor=')
  const mutation = useApiMutation()
  const [pending, setPending] = useState<{ id: string; move: ProductMove } | null>(null)
  // While the list is read again after a move: the next move waits, so each answer keys to its list.
  const [reloading, setReloading] = useState(false)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const [refused, setRefused] = useState<{ item: ProductListItem; items: ReadinessItem[] } | null>(
    null
  )
  // The product the archive dialog is about; it outlives the dialog's closing animation.
  const [archiving, setArchiving] = useState<ProductListItem | null>(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const archivedId = useRef<string | null>(null)
  // What each move answered, for the list it was made on: a list read again replaces it.
  const [moved, setMoved] = useState<{ list: Props['products']; statuses: Record<string, string> }>(
    { list: products, statuses: {} }
  )
  // The row whose actions button takes focus once the list has been read again.
  const [focusRow, setFocusRow] = useState<{ id: string; turn: number } | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const refusedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusRow) return
    ;(visibleActions(focusRow.id) ?? headingRef.current)?.focus()
  }, [focusRow])

  useEffect(() => {
    if (refused) refusedRef.current?.focus()
  }, [refused])

  if (!current) return null
  const shop = current

  function chooseMove(item: ProductListItem, move: ProductMove) {
    setProblem(null)
    setOffline(false)
    setRefused(null)
    if (move === 'archive') {
      archivedId.current = null
      setArchiving(item)
      setArchiveOpen(true)
      return
    }
    void runMove(item, move)
  }

  async function runMove(item: ProductListItem, move: ProductMove) {
    setPending({ id: item.id, move })
    const outcome = await mutation.run(sendMove(shop.slug, item.id, move))
    setPending(null)
    if (!outcome) return
    if (outcome.ok) {
      if (move === 'archive') {
        archivedId.current = item.id
        setArchiveOpen(false)
      }
      const status = outcome.data.data.status
      setMoved((previous) => ({
        list: products,
        statuses: { ...(previous.list === products ? previous.statuses : {}), [item.id]: status },
      }))
      toast.success(t(MOVE_DONE[move], { title: item.title }))
      setReloading(true)
      router.reload({
        only: ['products'],
        // Also when the reload fails: the row shows the answered status meanwhile.
        onFinish: () => {
          setReloading(false)
          setFocusRow((previous) => ({ id: item.id, turn: (previous?.turn ?? 0) + 1 }))
        },
      })
      return
    }
    // useApiMutation shows the wait above the list, and in the archive dialog.
    if ('problem' in outcome && outcome.problem.code === 'RATE_LIMITED') return
    setArchiveOpen(false)
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    const found = outcome.problem
    if (found.code === 'VALIDATION_FAILED' && found.errors?.length) {
      setRefused({
        item,
        items: found.errors.map((entry) => ({
          field: entry.field ?? '',
          code: entry.code,
          message: entry.message,
        })),
      })
      return
    }
    setProblem(moveProblemOf(found))
    // Moved or removed meanwhile, or the shop's status changed: the page catches up.
    if (found.code === 'INVALID_STATE_TRANSITION' || found.code === 'NOT_FOUND') {
      router.reload({ only: ['products'] })
    }
    if (found.code === 'SHOP_NOT_ACTIVE') router.reload()
  }

  const blocked = mutation.pending || reloading || mutation.retryIn > 0
  // A role with neither move permission, or a shop that may not change its catalogue, has no actions.
  const mayMove =
    catalogEditable(shop.status) &&
    (can(shop, 'shop.products.publish') || can(shop, 'shop.products.edit'))
  const answered = moved.list === products ? moved.statuses : {}
  const items = products.items.map((item) =>
    answered[item.id] ? { ...item, status: answered[item.id] } : item
  )
  const rowActions = (item: ProductListItem, layout: 'table' | 'card') => {
    const moves = productMoves(item.status, shop.status, (permission) => can(shop, permission))
    if (moves.length === 0) return null
    return (
      <MoveMenu
        moves={moves}
        id={actionsId(item.id, layout)}
        rowId={item.id}
        title={item.title}
        pending={pending?.id === item.id ? pending.move : null}
        blocked={blocked}
        describedBy={mutation.retryIn > 0 ? RATE_LIMIT_ID : undefined}
        onMove={(move) => chooseMove(item, move)}
      />
    )
  }
  const canAdd = can(current, 'shop.products.edit') && catalogEditable(current.status)
  const filtered = filters.status !== null || filters.q !== null
  const query: Record<string, string> = {}
  if (filters.status) query.status = filters.status
  if (filters.q) query.q = filters.q
  const next = products.meta.next_cursor
  return (
    <>
      <Head title={t('seller.products.page_title', { name: current.name })} />
      <div className="space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <h1
              ref={headingRef}
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
            >
              {t('seller.products.heading')}
            </h1>
            <p className="text-muted-foreground max-w-prose">{t('seller.products.intro')}</p>
          </div>
          {canAdd && (
            <Button asChild className="h-11 text-base md:text-sm">
              <Link route="seller.products.new" routeParams={{ shopSlug: current.slug }}>
                {t('seller.products.add')}
              </Link>
            </Button>
          )}
        </header>
        {(filtered || products.items.length > 0) && (
          <ProductFilters shopSlug={current.slug} status={filters.status} q={filters.q} />
        )}
        <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
        <ProblemAlert problem={problem} offline={offline} entity="product" />
        {refused && (
          <Alert role="alert" ref={refusedRef} tabIndex={-1} className="outline-none">
            <AlertTitle>
              {t('seller.products.refused_title', { title: refused.item.title })}
            </AlertTitle>
            <AlertDescription className="space-y-3">
              <ReadinessItems
                items={refused.items}
                editable={false}
                shopSlug={current.slug}
                nameOf={() => undefined}
              />
              <Link
                route="seller.products.edit"
                routeParams={{ shopSlug: current.slug, productId: refused.item.id }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.refused_open', { title: refused.item.title })}
              </Link>
            </AlertDescription>
          </Alert>
        )}
        {products.items.length === 0 ? (
          filtered ? (
            <EmptyState
              heading={t('seller.products.no_match_heading')}
              body={t('seller.products.no_match_body')}
            >
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.clear_filters')}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              heading={t('seller.products.empty_heading')}
              body={
                canAdd ? t('seller.products.empty_body') : t('seller.products.empty_body_read_only')
              }
            />
          )
        ) : (
          <ProductsTable
            shopSlug={current.slug}
            products={items}
            actions={mayMove ? rowActions : undefined}
          />
        )}
        {(next || onLaterPage) && (
          <nav className="flex gap-4" aria-label={t('seller.products.pages')}>
            {onLaterPage && (
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                qs={query}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.first_page')}
              </Link>
            )}
            {next && (
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                qs={{ ...query, cursor: next }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.next_page')}
              </Link>
            )}
          </nav>
        )}
      </div>
      {archiving && (
        <ArchiveDialog
          title={archiving.title}
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          pending={pending?.id === archiving.id && pending.move === 'archive'}
          retryIn={mutation.retryIn}
          onConfirm={() => void runMove(archiving, 'archive')}
          onCloseAutoFocus={(event) => {
            // After an archive the list is read again and focus follows; cancelled, back to the row's menu button.
            event.preventDefault()
            if (archivedId.current === archiving.id) return
            ;(visibleActions(archiving.id) ?? headingRef.current)?.focus()
          }}
        />
      )}
    </>
  )
}
