import { useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { ImageIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { cn, getDiscountPercentage } from '~/lib/utils'
import { formatNPR } from '@shared/format/money'

type CatalogProductCardProps = {
  product: Data.ProductCard
  className?: string
}

/*
 * A product in a storefront grid or carousel. Links to the product page;
 * shows the second photo on hover when there is one.
 */
export function CatalogProductCard({ product, className }: CatalogProductCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const image = isHovered && product.hoverImage ? product.hoverImage : product.image
  const discount = product.comparePriceMinor
    ? getDiscountPercentage(product.comparePriceMinor, product.priceMinor)
    : 0

  return (
    <Link
      route="products.show"
      routeParams={{ slug: product.slug }}
      className={cn('group relative flex flex-col', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative mb-3 aspect-[4/5] overflow-hidden rounded-lg bg-muted">
        {image ? (
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex size-full items-center justify-center">
            <ImageIcon className="size-8 text-muted-foreground/50" />
          </div>
        )}

        {!product.inStock && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]">
            <span className="text-sm font-medium text-muted-foreground">Out of stock</span>
          </div>
        )}

        {discount > 0 && (
          <span className="pointer-events-none absolute top-2 left-2 rounded-md bg-primary px-1.5 py-0.5 text-xs font-semibold text-primary-foreground md:top-3 md:left-3">
            -{discount}%
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {product.shop && (
          <span className="truncate text-xs text-muted-foreground">{product.shop.name}</span>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug group-hover:underline">
          {product.name}
        </h3>
        <div className="mt-auto flex items-baseline gap-2 pt-1">
          <span className="text-sm font-semibold">{formatNPR(product.priceMinor)}</span>
          {product.comparePriceMinor && (
            <span className="text-xs text-muted-foreground line-through">
              {formatNPR(product.comparePriceMinor)}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
