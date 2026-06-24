import { useState } from 'react'
import { cn } from '~/lib/utils'
import { Heart, Eye } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { CategoryProduct } from '~/pages/commerce/categories/mock'

type ProductCardProps = {
  product: CategoryProduct
  onQuickAdd?: (product: CategoryProduct) => void
  onWishlist?: (id: string) => void
  className?: string
}

export function ProductCard({ product, onQuickAdd, onWishlist, className }: ProductCardProps) {
  const [isHovered, setIsHovered] = useState(false)

  const badgeColors: Record<string, string> = {
    'new': 'bg-blue-600 text-white',
    'sale': 'bg-red-600 text-white',
    'best-seller': 'bg-amber-600 text-white',
    'limited': 'bg-purple-600 text-white',
  }

  return (
    <div
      className={cn('group relative flex flex-col', className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="relative aspect-[4/5] overflow-hidden rounded-lg bg-muted mb-3">
        <AnimatePresence mode="wait">
          <motion.img
            key={isHovered && product.hoverImage ? 'hover' : 'default'}
            src={isHovered && product.hoverImage ? product.hoverImage : product.image}
            alt={product.name}
            className="absolute inset-0 size-full object-cover"
            initial={{ opacity: 0, scale: 1.05 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          />
        </AnimatePresence>

        {!product.inStock && (
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="text-sm font-medium text-muted-foreground">Out of Stock</span>
          </div>
        )}

        {product.badge && (
          <Badge
            className={cn('absolute top-3 left-3 pointer-events-none', badgeColors[product.badge])}
          >
            {product.badge === 'best-seller'
              ? 'Best Seller'
              : product.badge.charAt(0).toUpperCase() + product.badge.slice(1)}
          </Badge>
        )}

        {product.discount && (
          <Badge
            variant="destructive"
            className="absolute top-3 right-3 pointer-events-none md:opacity-0 md:group-hover:opacity-100 transition-opacity"
          >
            -{product.discount}%
          </Badge>
        )}

        <div className="absolute top-3 right-3 flex flex-col gap-2 opacity-0 md:group-hover:opacity-100 transition-opacity">
          <Button
            size="icon-xs"
            variant="secondary"
            className="size-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onWishlist?.(product.id)}
            aria-label={product.isFavorited ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart className={cn('size-4', product.isFavorited && 'fill-red-500 text-red-500')} />
          </Button>
          <Button
            size="icon-xs"
            variant="secondary"
            className="size-8 rounded-full bg-background/80 backdrop-blur-sm hover:bg-background"
            onClick={() => onQuickAdd?.(product)}
            aria-label="Quick view"
          >
            <Eye className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1 px-0.5">
        <span className="text-xs text-muted-foreground">{product.storeName}</span>
        <h3 className="text-sm font-medium leading-tight line-clamp-2">{product.name}</h3>

        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-yellow-500">{'★'.repeat(Math.round(product.rating))}</span>
          <span>({product.reviewCount})</span>
        </div>

        <div className="flex items-center gap-2 mt-1">
          <span className="text-sm font-semibold">
            {product.currency} {product.price.toLocaleString()}
          </span>
          {product.compareAt && (
            <span className="text-xs text-muted-foreground line-through">
              {product.currency} {product.compareAt.toLocaleString()}
            </span>
          )}
        </div>

        {product.colors.length > 0 && (
          <div className="flex items-center gap-1 mt-1">
            {product.colors.map((color) => (
              <span
                key={color.value}
                className="size-3 rounded-full border border-border"
                style={{ backgroundColor: color.value }}
                title={color.name}
              />
            ))}
          </div>
        )}

        <Button
          size="sm"
          variant="outline"
          className="mt-2 w-full opacity-0 md:group-hover:opacity-100 transition-opacity"
          disabled={!product.inStock}
          onClick={() => onQuickAdd?.(product)}
        >
          {product.inStock ? 'Quick Add' : 'Out of Stock'}
        </Button>
      </div>
    </div>
  )
}
