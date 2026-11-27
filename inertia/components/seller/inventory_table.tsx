import { useRef } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Link } from '@adonisjs/inertia/react'
import { formatDateTime } from '@shared/format/date'
import { movementDelta } from '@shared/ui/stock'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '~/components/ui/table'
import { StatusBadge } from '~/components/common/status_badge'
import { REASON_LABEL, type StockVariant } from '~/components/seller/stock_dialogs'

/*
 * The stock list of `/seller/{shopSlug}/inventory` (docs/08 §2.5, §6.3,
 * §7.2; 02 J-11 step 1; R1-S part 2f-iv-a): one section per product, its
 * title linking to the product editor, then its variants (the active ones,
 * then the archived ones that still hold stock): a table from
 * `md` (caption, column headers, its own keyboard-focusable scroll region)
 * and one card per variant below `md`, with the same fields: the variant,
 * its SKU, on hand, reserved, available and its last stock change. A
 * product with no variant to show (no active one, and no archived one
 * holding stock) says how to add one (02 J-11 "Empty").
 *
 * Each variant's name links to its stock history (`/inventory/{variantId}`,
 * R1-S part 2f-iv-b). An archived variant is listed after the active ones
 * while it still holds stock, marked "Archived"; its stock may still be
 * adjusted or counted (docs/05 §5.9).
 *
 * With `actions`, each variant has one menu button named with its SKU
 * ("Actions for TS-BLK-M", 08 §7.2) offering "Adjust stock" and "Count
 * stock". A choice runs once the menu has given focus back to its button,
 * so the dialog it opens takes focus after it (08 §7.3 rule 1).
 */
export type InventoryVariant = StockVariant & {
  is_default: boolean
  status: 'active' | 'archived'
  available: number
  version: number
  last_movement: {
    kind: string
    reason_code: string
    on_hand_delta: number
    reserved_delta: number
    created_at: string
  } | null
}

export type InventoryProduct = {
  product_id: string
  public_id: string
  title: string
  status: string
  updated_at: string
  variants: InventoryVariant[]
}

export type StockAction = 'adjust' | 'count'

// A variant's actions button; the table and the cards each render one.
const stockActionsId = (variantId: string, layout: 'table' | 'card') =>
  `stock-${variantId}-actions-${layout}`

const KIND_LABEL: Record<string, Parameters<typeof t>[0]> = {
  reserve: 'seller.stock.kind.reserve',
  release: 'seller.stock.kind.release',
  commit: 'seller.stock.kind.commit',
  ship: 'seller.stock.kind.ship',
  return_restock: 'seller.stock.kind.return_restock',
  rto_restock: 'seller.stock.kind.rto_restock',
  stocktake: 'seller.stock.kind.stocktake',
  correction: 'seller.stock.kind.correction',
}

// What a movement was: its kind, or an adjustment's reason (the stock history shares it).
export function movementWhat(movement: { kind: string; reason_code: string }) {
  return movement.kind === 'adjustment'
    ? REASON_LABEL[movement.reason_code]
      ? t(REASON_LABEL[movement.reason_code])
      : movement.reason_code
    : KIND_LABEL[movement.kind]
      ? t(KIND_LABEL[movement.kind])
      : movement.kind
}

// "Received stock, +5 on hand", from the kind or an adjustment's reason; no number when none moved.
function changeText(movement: NonNullable<InventoryVariant['last_movement']>) {
  const what = movementWhat(movement)
  const moved = movementDelta(movement)
  if (!moved) return what
  const signed = moved.delta > 0 ? `+${moved.delta}` : `${moved.delta}`
  return moved.column === 'on_hand'
    ? t('seller.stock.change_on_hand', { what, delta: signed })
    : t('seller.stock.change_reserved', { what, delta: signed })
}

function LastChange({ variant }: { variant: InventoryVariant }) {
  const movement = variant.last_movement
  if (!movement) return <span className="text-muted-foreground">{t('seller.stock.no_change')}</span>
  return (
    <span>
      {changeText(movement)}
      <span className="text-muted-foreground block text-xs">
        {formatDateTime(movement.created_at)}
      </span>
    </span>
  )
}

function StockMenu({
  variant,
  layout,
  onAction,
}: {
  variant: InventoryVariant
  layout: 'table' | 'card'
  onAction: (action: StockAction, variant: InventoryVariant) => void
}) {
  const chosen = useRef<StockAction | null>(null)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          id={stockActionsId(variant.variant_id, layout)}
          data-stock-row={variant.variant_id}
          type="button"
          variant="outline"
          className="h-11 text-base md:h-9 md:text-sm"
        >
          {t('seller.stock.actions')}
          <span className="sr-only"> {t('seller.stock.actions_for', { sku: variant.sku })}</span>
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={() => {
          // The default still returns focus to the button first; then the dialog opens.
          const action = chosen.current
          chosen.current = null
          if (action) queueMicrotask(() => onAction(action, variant))
        }}
      >
        <DropdownMenuItem onSelect={() => (chosen.current = 'adjust')}>
          {t('seller.stock.adjust')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => (chosen.current = 'count')}>
          {t('seller.stock.count')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function variantName(variant: InventoryVariant) {
  return variant.is_default ? t('seller.stock.default_variant') : variant.label
}

// The variant's name, linking to its history, and "Archived" when it is.
function VariantCell({ shopSlug, variant }: { shopSlug: string; variant: InventoryVariant }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Link
        route="seller.inventory.history"
        routeParams={{ shopSlug, variantId: variant.variant_id }}
        className="text-link break-words underline-offset-4 hover:underline"
      >
        {variantName(variant)}
        <span className="sr-only"> {t('seller.stock.history_link', { sku: variant.sku })}</span>
      </Link>
      {variant.status === 'archived' && (
        <span className="text-muted-foreground rounded border px-1.5 text-xs">
          {t('seller.stock.archived')}
        </span>
      )}
    </span>
  )
}

function ProductStock({
  shopSlug,
  product,
  actions,
}: {
  shopSlug: string
  product: InventoryProduct
  actions?: (action: StockAction, variant: InventoryVariant) => void
}) {
  const headingId = `stock-product-${product.product_id}`
  const caption = t('seller.stock.table_label', { title: product.title })
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id={headingId} className="text-lg font-semibold break-words">
          <Link
            route="seller.products.edit"
            routeParams={{ shopSlug, productId: product.product_id }}
            className="text-link underline-offset-4 hover:underline"
          >
            {product.title}
          </Link>
        </h2>
        <StatusBadge entity="product" state={product.status} />
        <span className="text-muted-foreground text-xs">{product.public_id}</span>
      </div>
      {product.variants.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('seller.stock.no_variants')}</p>
      ) : (
        <>
          <div
            role="region"
            aria-label={caption}
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scrolling table region is keyboard-focusable (docs/08 §6.3)
            tabIndex={0}
            className="hidden overflow-x-auto rounded-md border md:block"
          >
            <table className="w-full caption-bottom text-sm">
              <caption className="sr-only">{caption}</caption>
              <TableHeader className="bg-muted/50">
                <TableRow>
                  <TableHead scope="col">{t('seller.stock.column.variant')}</TableHead>
                  <TableHead scope="col">{t('seller.stock.column.sku')}</TableHead>
                  <TableHead scope="col" className="text-end">
                    {t('seller.stock.column.on_hand')}
                  </TableHead>
                  <TableHead scope="col" className="text-end">
                    {t('seller.stock.column.reserved')}
                  </TableHead>
                  <TableHead scope="col" className="text-end">
                    {t('seller.stock.column.available')}
                  </TableHead>
                  <TableHead scope="col">{t('seller.stock.column.last_change')}</TableHead>
                  {actions && <TableHead scope="col">{t('seller.stock.column.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((variant) => (
                  <TableRow key={variant.variant_id}>
                    <TableCell className="whitespace-normal">
                      <VariantCell shopSlug={shopSlug} variant={variant} />
                    </TableCell>
                    <TableCell className="font-mono text-xs break-all whitespace-normal">
                      {variant.sku}
                    </TableCell>
                    <TableCell className="text-end tabular-nums">{variant.on_hand}</TableCell>
                    <TableCell className="text-end tabular-nums">{variant.reserved}</TableCell>
                    <TableCell className="text-end font-medium tabular-nums">
                      {variant.available}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <LastChange variant={variant} />
                    </TableCell>
                    {actions && (
                      <TableCell>
                        <StockMenu variant={variant} layout="table" onAction={actions} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden" aria-label={caption}>
            {product.variants.map((variant) => (
              <li key={variant.variant_id} className="space-y-2 rounded-md border p-4">
                <p className="font-medium">
                  <VariantCell shopSlug={shopSlug} variant={variant} />
                </p>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt className="text-muted-foreground">{t('seller.stock.column.sku')}</dt>
                  <dd className="font-mono text-xs break-all">{variant.sku}</dd>
                  <dt className="text-muted-foreground">{t('seller.stock.column.on_hand')}</dt>
                  <dd className="tabular-nums">{variant.on_hand}</dd>
                  <dt className="text-muted-foreground">{t('seller.stock.column.reserved')}</dt>
                  <dd className="tabular-nums">{variant.reserved}</dd>
                  <dt className="text-muted-foreground">{t('seller.stock.column.available')}</dt>
                  <dd className="font-medium tabular-nums">{variant.available}</dd>
                  <dt className="text-muted-foreground">{t('seller.stock.column.last_change')}</dt>
                  <dd>
                    <LastChange variant={variant} />
                  </dd>
                </dl>
                {actions && (
                  <div className="pt-1">
                    <StockMenu variant={variant} layout="card" onAction={actions} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

export function InventoryTable({
  shopSlug,
  products,
  actions,
}: {
  shopSlug: string
  products: InventoryProduct[]
  actions?: (action: StockAction, variant: InventoryVariant) => void
}) {
  return (
    <div className="space-y-8">
      {products.map((product) => (
        <ProductStock
          key={product.product_id}
          shopSlug={shopSlug}
          product={product}
          actions={actions}
        />
      ))}
    </div>
  )
}
