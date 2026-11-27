import { useEffect, useRef, useState } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { toast } from 'sonner'
import { stockChangesOffered } from '@shared/ui/stock'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { EmptyState } from '~/components/common/empty_state'
import { ProductFilters } from '~/components/seller/product_filters'
import {
  InventoryTable,
  type InventoryProduct,
  type InventoryVariant,
  type StockAction,
} from '~/components/seller/inventory_table'
import {
  AdjustStockDialog,
  CountStockDialog,
  type StockVariant,
} from '~/components/seller/stock_dialogs'

/*
 * `/seller/{shopSlug}/inventory`, the stock page (docs/08 §2.5 `/inventory`
 * row; 02 J-11; R1-S part 2f-iv-a), rendered in the browser in the seller
 * layout. Its props are one cursor page of `listInventory` (`inventory`:
 * each product with its active variants' stock, then its archived variants
 * that still hold stock) and the filters the server
 * read from the URL (`filters`), shared with the product list: the status
 * and a title or SKU prefix (app/controllers/seller/inventory).
 *
 * A role with `shop.inventory.adjust`, while the shop may change its stock
 * (`stockChangesOffered`: the writes' `products_edit` gate), gets each
 * variant's actions menu: "Adjust stock" and "Count stock", each a form
 * dialog (stock_dialogs.tsx) that shows the variant's numbers as last read.
 * After a save a toast gives the new on-hand number, the `inventory` prop
 * is read again, and focus goes back to the variant's menu button, or the
 * heading when the variant left the list (08 §7.3 rule 1), unless another
 * dialog has opened meanwhile. A refusal or a timeout also reads the list
 * again. Cursors go forward only, keeping the filters (08 §7.2).
 */
type Props = InertiaProps<{
  inventory: { items: InventoryProduct[]; meta: { limit: number; next_cursor: string | null } }
  filters: { status: string | null; q: string | null }
}>

// The variant as the list last read it, so a reopened or refused dialog shows the current numbers.
function currentVariant(items: InventoryProduct[], variant: StockVariant): StockVariant {
  for (const product of items) {
    const found = product.variants.find((candidate) => candidate.variant_id === variant.variant_id)
    if (found) return found
  }
  return variant
}

// The variant's visible actions button (the table's or the card's, by the screen's width).
function visibleActions(variantId: string) {
  const buttons = document.querySelectorAll<HTMLElement>(`[data-stock-row="${variantId}"]`)
  return [...buttons].find((button) => button.offsetParent !== null) ?? null
}

export default function SellerInventory({ inventory, filters, current_shop: current }: Props) {
  const onLaterPage = usePage().url.includes('cursor=')
  // The dialog's variant outlives its closing animation; `open` says whether it shows.
  const [dialog, setDialog] = useState<{ action: StockAction; variant: StockVariant } | null>(null)
  const [open, setOpen] = useState(false)
  // Whether a dialog shows now, for the focus a finished reload must not take from it.
  const openNow = useRef(false)
  // Each opening mounts a fresh dialog, so it starts empty for its variant.
  const [turn, setTurn] = useState(0)
  const [focusRow, setFocusRow] = useState<{ id: string; turn: number } | null>(null)
  const saved = useRef(false)
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (!focusRow) return
    ;(visibleActions(focusRow.id) ?? headingRef.current)?.focus()
  }, [focusRow])

  if (!current) return null
  const mayChange = stockChangesOffered(current.status, (permission) => can(current, permission))
  const filtered = filters.status !== null || filters.q !== null
  const query: Record<string, string> = {}
  if (filters.status) query.status = filters.status
  if (filters.q) query.q = filters.q
  const next = inventory.meta.next_cursor

  function openDialog(action: StockAction, variant: InventoryVariant) {
    saved.current = false
    setDialog({ action, variant })
    setTurn((previous) => previous + 1)
    showDialog(true)
  }

  function showDialog(shown: boolean) {
    openNow.current = shown
    setOpen(shown)
  }

  function onSaved(variant: StockVariant, onHand: number) {
    saved.current = true
    toast.success(t('seller.stock.saved', { sku: variant.sku, on_hand: onHand }))
    router.reload({
      only: ['inventory'],
      onFinish: () => {
        if (openNow.current) return
        setFocusRow((previous) => ({ id: variant.variant_id, turn: (previous?.turn ?? 0) + 1 }))
      },
    })
  }

  const dialogProps = {
    shopSlug: current.slug,
    open,
    onOpenChange: showDialog,
    onSaved,
    onStale: () => router.reload({ only: ['inventory'] }),
    onCloseAutoFocus: (event: Event) => {
      // After a save the list is read again and focus follows; cancelled, back to the menu button.
      event.preventDefault()
      if (saved.current || !dialog) return
      ;(visibleActions(dialog.variant.variant_id) ?? headingRef.current)?.focus()
    },
  }

  return (
    <>
      <Head title={t('seller.stock.page_title', { name: current.name })} />
      <div className="space-y-6">
        <header className="space-y-2">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('seller.stock.heading')}
          </h1>
          <p className="text-muted-foreground max-w-prose">{t('seller.stock.intro')}</p>
        </header>
        {(filtered || inventory.items.length > 0) && (
          <ProductFilters
            shopSlug={current.slug}
            status={filters.status}
            q={filters.q}
            list="inventory"
          />
        )}
        {inventory.items.length === 0 ? (
          filtered ? (
            <EmptyState
              heading={t('seller.products.no_match_heading')}
              body={t('seller.products.no_match_body')}
            >
              <Link
                route="seller.inventory"
                routeParams={{ shopSlug: current.slug }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.clear_filters')}
              </Link>
            </EmptyState>
          ) : (
            <EmptyState
              heading={t('seller.stock.empty_heading')}
              body={t('seller.stock.empty_body')}
            >
              <Link
                route="seller.products"
                routeParams={{ shopSlug: current.slug }}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.stock.to_products')}
              </Link>
            </EmptyState>
          )
        ) : (
          <InventoryTable
            shopSlug={current.slug}
            products={inventory.items}
            actions={mayChange ? openDialog : undefined}
          />
        )}
        {(next || onLaterPage) && (
          <nav className="flex gap-4" aria-label={t('seller.products.pages')}>
            {onLaterPage && (
              <Link
                route="seller.inventory"
                routeParams={{ shopSlug: current.slug }}
                qs={query}
                className="text-link underline-offset-4 hover:underline"
              >
                {t('seller.products.first_page')}
              </Link>
            )}
            {next && (
              <Link
                route="seller.inventory"
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
      {dialog?.action === 'adjust' && (
        <AdjustStockDialog
          key={turn}
          variant={currentVariant(inventory.items, dialog.variant)}
          {...dialogProps}
        />
      )}
      {dialog?.action === 'count' && (
        <CountStockDialog
          key={turn}
          variant={currentVariant(inventory.items, dialog.variant)}
          {...dialogProps}
        />
      )}
    </>
  )
}
