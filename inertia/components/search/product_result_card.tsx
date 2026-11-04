import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { ImageIcon } from 'lucide-react'
import { formatPrice } from '~/lib/format'
import { cn } from '~/lib/utils'
import type { OptionRowProps } from './types'

type ProductResultCardProps = OptionRowProps & {
  product: Data.ProductCard
}

export function ProductResultCard({
  product,
  id,
  isActive,
  onHover,
  onSelect,
}: ProductResultCardProps) {
  const meta = [product.shop?.name, product.category?.name].filter(Boolean).join(' · ')

  return (
    <Link
      route="products.show"
      routeParams={{ slug: product.slug }}
      id={id}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
        isActive ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
        {product.image ? (
          <img src={product.image} alt="" loading="lazy" className="size-full object-cover" />
        ) : (
          <ImageIcon aria-hidden="true" className="size-4 text-muted-foreground/50" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold">{formatPrice(product.price)}</p>
        {product.comparePrice && (
          <p className="text-xs text-muted-foreground line-through">
            {formatPrice(product.comparePrice)}
          </p>
        )}
      </div>
    </Link>
  )
}
