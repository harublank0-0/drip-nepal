import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { ProductThumb } from '~/components/commerce/product_thumb'
import { formatPrice } from '~/lib/format'

/*
 * The lines of a placed order. Names and prices are the snapshot taken at
 * checkout; the product link is only there while the product still exists.
 */
export function OrderItemsList({ items }: { items: Data.Order['items'] }) {
  return (
    <ul className="divide-y divide-border/50">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 py-3">
          <ProductThumb image={item.image} className="size-14 sm:size-16" />
          <div className="min-w-0 flex-1">
            {item.productSlug ? (
              <Link
                route="products.show"
                routeParams={{ slug: item.productSlug }}
                className="line-clamp-2 text-sm font-medium hover:underline"
              >
                {item.name}
              </Link>
            ) : (
              <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
            )}
            {item.variantLabel && (
              <p className="text-xs text-muted-foreground">{item.variantLabel}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
              {item.quantity} × {formatPrice(item.unitPrice)}
            </p>
          </div>
          <p className="shrink-0 text-sm font-medium tabular-nums">{formatPrice(item.subTotal)}</p>
        </li>
      ))}
    </ul>
  )
}
