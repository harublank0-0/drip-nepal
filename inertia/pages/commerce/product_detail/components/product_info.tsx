import { Link } from '@adonisjs/inertia/react'
import { Banknote } from 'lucide-react'
import type { Data } from '@generated/data'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/utils'
import {
  LOW_STOCK_THRESHOLD,
  purchaseLabel,
  type VariantOption,
  type VariantSelection,
} from '../hooks/use_variant_selection'
import { PriceTag } from './price_tag'
import { QuantityStepper } from './quantity_stepper'
import { StoreCard } from './store_card'
import { VariantSelector } from './variant_selector'

type ProductInfoProps = {
  product: Data.Product
  selection: VariantSelection
  onSelect: (option: VariantOption, value: string) => void
  onQuantityChange: (quantity: number) => void
  onAddToCart: () => void
  processing: boolean
  error?: string
  ctaRef?: React.Ref<HTMLDivElement>
}

export function ProductInfo({
  product,
  selection,
  onSelect,
  onQuantityChange,
  onAddToCart,
  processing,
  error,
  ctaRef,
}: ProductInfoProps) {
  const { category, shop } = product
  const canAdd = selection.state === 'ready' && !processing

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb">
        <ol className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground md:text-sm">
          <li className="shrink-0">
            <Link route="home" className="transition-colors hover:text-foreground">
              Home
            </Link>
          </li>
          {category && (
            <>
              <li aria-hidden="true">/</li>
              <li className="shrink-0">
                <Link
                  route="categories.show"
                  routeParams={{ slug: category.slug }}
                  className="transition-colors hover:text-foreground"
                >
                  {category.name}
                </Link>
              </li>
            </>
          )}
          <li aria-hidden="true">/</li>
          <li className="min-w-0 truncate text-foreground" aria-current="page">
            {product.name}
          </li>
        </ol>
      </nav>

      <div>
        {shop && (
          <Link
            route="stores.show"
            routeParams={{ slug: shop.slug }}
            className="mb-1.5 inline-block text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:text-foreground"
          >
            {shop.name}
          </Link>
        )}
        <h1 className="font-heading text-2xl leading-tight font-bold tracking-tight md:text-3xl lg:text-4xl">
          {product.name}
        </h1>
        {product.brand && (
          <p className="mt-2 text-sm text-muted-foreground">
            Brand: <span className="text-foreground">{product.brand}</span>
          </p>
        )}
      </div>

      <div className="space-y-2">
        <PriceTag price={selection.price} />
        <StockStatus selection={selection} />
      </div>

      <Separator />

      <VariantSelector
        sizes={selection.sizes}
        colors={selection.colors}
        selectedSize={selection.selectedSize}
        selectedColor={selection.selectedColor}
        onSelect={onSelect}
      />

      <div ref={ctaRef} className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-sm font-medium">Quantity</span>
          <QuantityStepper
            value={selection.quantity}
            max={selection.maxQuantity}
            disabled={selection.state !== 'ready' || processing}
            onChange={onQuantityChange}
          />
        </div>

        <Button
          type="button"
          size="lg"
          className="h-12 w-full text-base font-semibold"
          disabled={!canAdd}
          onClick={onAddToCart}
        >
          {processing ? (
            <>
              <Spinner />
              Adding…
            </>
          ) : (
            purchaseLabel(selection)
          )}
        </Button>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <p className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm ring-1 ring-foreground/5">
        <Banknote className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        Cash on delivery across Nepal
      </p>

      {shop && <StoreCard shop={shop} />}
    </div>
  )
}

function StockStatus({ selection }: { selection: VariantSelection }) {
  const { state, selectedVariant } = selection

  let tone: 'ok' | 'low' | 'none' | 'muted' | null = null
  let text = ''

  if (state === 'unavailable') {
    tone = 'muted'
    text = 'Currently unavailable'
  } else if (state === 'sold_out' || state === 'out_of_stock') {
    tone = 'none'
    text = 'Out of stock'
  } else if (selectedVariant && selectedVariant.quantity <= LOW_STOCK_THRESHOLD) {
    tone = 'low'
    text = `Only ${selectedVariant.quantity} left`
  } else if (selectedVariant) {
    tone = 'ok'
    text = 'In stock'
  }

  if (!tone) return null

  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-sm font-medium',
        tone === 'ok' && 'text-emerald-600 dark:text-emerald-400',
        tone === 'low' && 'text-amber-600 dark:text-amber-400',
        tone === 'none' && 'text-destructive',
        tone === 'muted' && 'text-muted-foreground'
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {text}
    </p>
  )
}
