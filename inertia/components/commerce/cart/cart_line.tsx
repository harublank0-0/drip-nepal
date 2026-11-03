import { Link } from '@adonisjs/inertia/react'
import { AlertCircleIcon, Trash2Icon } from 'lucide-react'
import type { Data } from '@generated/data'
import { ProductThumb } from '~/components/commerce/product_thumb'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { formatPrice } from '~/lib/format'
import { MAX_QUANTITY_PER_ITEM } from '~/lib/order'
import { cn } from '~/lib/utils'
import { QuantitySelector } from './quantity_selector'

export type CartLineData = Data.CartSummary['shops'][number]['items'][number]

type CartLineProps = {
  line: CartLineData
  pending: boolean
  error?: string
  onQuantityChange: (quantity: number) => void
  onRemove: () => void
}

export function CartLine({ line, pending, error, onQuantityChange, onRemove }: CartLineProps) {
  const { product, variant } = line
  const max = Math.max(Math.min(variant.stock, MAX_QUANTITY_PER_ITEM), line.quantity)
  const onSale = variant.comparePrice !== null && variant.comparePrice > variant.price
  /* More in the cart than the shop has left: offer to take what's there. */
  const canReduceToStock = !line.available && variant.stock > 0 && variant.stock < line.quantity

  return (
    <div
      className={cn('flex gap-3 py-4 sm:gap-4', pending && 'opacity-60 transition-opacity')}
      aria-busy={pending}
    >
      <Link
        route="products.show"
        routeParams={{ slug: product.slug }}
        tabIndex={-1}
        aria-hidden="true"
        className={cn('shrink-0', !line.available && 'opacity-50 grayscale')}
      >
        <ProductThumb image={product.image} className="size-20 sm:size-24" />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              route="products.show"
              routeParams={{ slug: product.slug }}
              className="line-clamp-2 text-sm font-medium hover:underline"
            >
              {product.name}
            </Link>
            {variant.label && <p className="text-xs text-muted-foreground">{variant.label}</p>}
          </div>
          <div className="shrink-0 text-right">
            <p
              className={cn(
                'text-sm font-semibold tabular-nums',
                !line.available && 'text-muted-foreground line-through'
              )}
            >
              {formatPrice(line.lineTotal)}
            </p>
            {(line.quantity > 1 || onSale) && (
              <p className="text-xs text-muted-foreground tabular-nums">
                {onSale && (
                  <>
                    <s className="mr-1">{formatPrice(variant.comparePrice!)}</s>
                    <span className="sr-only">now </span>
                  </>
                )}
                {formatPrice(variant.price)} each
              </p>
            )}
          </div>
        </div>

        {line.problem && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircleIcon className="size-3.5 shrink-0" aria-hidden="true" />
            {line.problem}
            {canReduceToStock && (
              <Button
                type="button"
                variant="link"
                size="xs"
                className="h-auto px-1 text-xs underline underline-offset-2"
                disabled={pending}
                onClick={() => onQuantityChange(variant.stock)}
              >
                Change to {variant.stock}
              </Button>
            )}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <QuantitySelector
            quantity={line.quantity}
            max={max}
            label={product.name}
            disabled={pending || variant.stock === 0}
            onChange={onQuantityChange}
          />
          <div className="flex items-center gap-2">
            {pending && <Spinner className="size-4 text-muted-foreground" />}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={pending}
              onClick={onRemove}
              aria-label={`Remove ${product.name} from cart`}
            >
              <Trash2Icon className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Remove</span>
            </Button>
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
