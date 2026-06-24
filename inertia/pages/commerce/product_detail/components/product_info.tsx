import { useState } from 'react'
import { Link } from '@adonisjs/inertia/react'
import { motion } from 'framer-motion'
import { Heart, Share2, Minus, Plus, Truck, ShieldCheck, RotateCcw, Banknote } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { cn } from '~/lib/utils'
import { getDiscountPercentage } from '~/lib/utils'
import { VariantSelector } from './variant_selector'
import { StoreCard } from './store_card'
import type { ProductData } from '../mock'

type ProductInfoProps = {
  product: ProductData
}

function StarRating({ rating, size = 'sm' }: { rating: number; size?: 'sm' | 'lg' }) {
  const stars = []
  const full = Math.floor(rating)
  const hasHalf = rating % 1 >= 0.5
  for (let i = 0; i < 5; i++) {
    if (i < full) stars.push('full')
    else if (i === full && hasHalf) stars.push('half')
    else stars.push('empty')
  }
  return (
    <span
      className={cn('flex gap-0.5', size === 'lg' ? 'text-lg' : 'text-sm')}
      aria-label={`${rating} out of 5 stars`}
    >
      {stars.map((s, i) => (
        <svg
          key={i}
          width={size === 'lg' ? 18 : 14}
          height={size === 'lg' ? 18 : 14}
          viewBox="0 0 24 24"
          fill={s === 'empty' ? 'none' : 'currentColor'}
          stroke="currentColor"
          strokeWidth="1.5"
          className={
            s === 'empty'
              ? 'text-muted-foreground/30'
              : s === 'half'
                ? 'text-amber-500'
                : 'text-amber-500'
          }
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      ))}
    </span>
  )
}

function QuantitySelector() {
  const [qty, setQty] = useState(1)
  return (
    <div className="flex items-center gap-0">
      <button
        onClick={() => setQty(Math.max(1, qty - 1))}
        className="size-10 flex items-center justify-center border border-border rounded-l-lg hover:bg-muted transition-colors"
        aria-label="Decrease quantity"
      >
        <Minus className="size-4" />
      </button>
      <span
        className="size-10 flex items-center justify-center border-t border-b border-border text-sm font-medium"
        aria-live="polite"
      >
        {qty}
      </span>
      <button
        onClick={() => setQty(Math.min(99, qty + 1))}
        className="size-10 flex items-center justify-center border border-border rounded-r-lg hover:bg-muted transition-colors"
        aria-label="Increase quantity"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}

export function ProductInfo({ product }: ProductInfoProps) {
  const discount = product.compareAt
    ? getDiscountPercentage(product.compareAt, product.price)
    : null

  const deliveryCards = [
    { icon: Banknote, label: 'Cash on Delivery', desc: 'Pay when you receive' },
    { icon: Truck, label: 'Estimated Delivery', desc: '3-5 business days' },
    { icon: RotateCcw, label: 'Easy Returns', desc: '14-day return policy' },
    { icon: ShieldCheck, label: 'Secure Payment', desc: '256-bit SSL encrypted' },
  ]

  const [isFavorited, setIsFavorited] = useState(false)

  return (
    <div className="space-y-8">
      {/* Breadcrumb */}
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-2 text-xs md:text-sm text-muted-foreground"
      >
        <Link route="home" className="hover:text-foreground transition-colors">
          Home
        </Link>
        <span aria-hidden="true">/</span>
        <Link route="men" className="hover:text-foreground transition-colors">
          Men
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-foreground font-medium">Hoodies</span>
        <span aria-hidden="true">/</span>
        <span className="text-foreground truncate max-w-[120px] md:max-w-[200px]">
          {product.title}
        </span>
      </nav>

      {/* Store Name */}
      <div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
          {product.store.name}
        </p>

        {/* Title */}
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading font-bold tracking-tight leading-tight">
          {product.title}
        </h1>

        {/* Rating */}
        <div className="flex items-center gap-2 mt-3">
          <StarRating rating={product.rating} />
          <span className="text-sm font-medium">{product.rating}</span>
          <span className="text-sm text-muted-foreground">({product.reviewCount} reviews)</span>
        </div>
      </div>

      {/* Price */}
      <div className="flex items-baseline gap-3">
        <span className="text-3xl md:text-4xl font-bold">
          {product.currency} {product.price.toLocaleString()}
        </span>
        {product.compareAt && (
          <>
            <span className="text-lg text-muted-foreground line-through">
              {product.currency} {product.compareAt.toLocaleString()}
            </span>
            {discount && (
              <span className="text-sm font-semibold text-primary bg-primary/10 px-2.5 py-0.5 rounded-full">
                {discount}% OFF
              </span>
            )}
          </>
        )}
      </div>

      {/* Stock Status */}
      <p className="text-sm font-medium text-emerald-500 flex items-center gap-1.5">
        <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
        {product.status}
      </p>

      <Separator />

      {/* Variants */}
      <VariantSelector colors={product.colors} sizes={product.sizes} />

      {/* Quantity + Actions */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium">Quantity</span>
          <QuantitySelector />
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button size="lg" className="flex-1 h-12 text-base font-semibold cursor-pointer">
            Add to Cart
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="flex-1 h-12 text-base font-semibold cursor-pointer"
          >
            Buy Now
          </Button>
        </div>

        <div className="flex gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => setIsFavorited(!isFavorited)}
            aria-label={isFavorited ? 'Remove from wishlist' : 'Add to wishlist'}
          >
            <Heart
              className={cn('size-4 transition-colors', isFavorited && 'fill-primary text-primary')}
            />
            Wishlist
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
            aria-label="Share product"
          >
            <Share2 className="size-4" />
            Share
          </Button>
        </div>
      </div>

      <Separator />

      {/* Mobile sticky CTA bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border p-4 flex gap-3 md:hidden">
        <Button className="flex-1 h-12 text-base font-semibold cursor-pointer">Add to Cart</Button>
        <Button
          variant="outline"
          size="icon"
          className="size-12 flex-shrink-0 cursor-pointer"
          onClick={() => setIsFavorited(!isFavorited)}
          aria-label={isFavorited ? 'Remove from wishlist' : 'Add to wishlist'}
        >
          <Heart className={cn('size-5', isFavorited && 'fill-primary text-primary')} />
        </Button>
      </div>

      {/* Delivery Info */}
      <div className="grid grid-cols-2 gap-3">
        {deliveryCards.map((card) => (
          <div
            key={card.label}
            className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 ring-1 ring-foreground/5"
          >
            <card.icon className="size-5 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium">{card.label}</p>
              <p className="text-xs text-muted-foreground">{card.desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Store Card */}
      <StoreCard store={product.store} />

      {/* Padding for mobile sticky bar */}
      <div className="h-20 md:hidden" aria-hidden="true" />
    </div>
  )
}
