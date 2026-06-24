import { cn } from '~/lib/utils'
import type { ProductResult } from './types'

type ProductResultCardProps = {
  product: ProductResult
  isSelected?: boolean
}

export function ProductResultCard({ product, isSelected }: ProductResultCardProps) {
  const discount = product.compareAt
    ? Math.round(((product.compareAt - product.price) / product.compareAt) * 100)
    : null

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors cursor-pointer',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <div className="size-14 rounded-lg overflow-hidden bg-muted flex-shrink-0">
        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{product.name}</p>
        <p className="text-xs text-muted-foreground truncate">{product.storeName}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-sm font-semibold">Rs. {product.price.toLocaleString()}</span>
          {discount && <span className="text-xs text-primary font-medium">{discount}% off</span>}
        </div>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-amber-500"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        {product.rating}
      </div>
    </div>
  )
}
