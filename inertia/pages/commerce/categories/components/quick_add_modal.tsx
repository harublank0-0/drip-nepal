import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '~/components/ui/dialog'
import { Button } from '~/components/ui/button'
import { ShoppingBag } from 'lucide-react'
import type { CategoryProduct } from '../mock'

type QuickAddModalProps = {
  product: CategoryProduct | null
  onClose: () => void
}

export function QuickAddModal({ product, onClose }: QuickAddModalProps) {
  const [selectedSize, setSelectedSize] = useState<string | null>(null)
  const [selectedColor, setSelectedColor] = useState<string | null>(null)

  if (!product) return null

  return (
    <Dialog open={!!product} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{product.name}</DialogTitle>
          <DialogDescription>{product.storeName}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="flex gap-4">
            <div className="size-20 rounded-lg overflow-hidden bg-muted shrink-0">
              <img src={product.image} alt={product.name} className="size-full object-cover" />
            </div>
            <div>
              <p className="text-lg font-semibold">
                {product.currency} {product.price.toLocaleString()}
              </p>
              {product.compareAt && (
                <p className="text-sm text-muted-foreground line-through">
                  {product.currency} {product.compareAt.toLocaleString()}
                </p>
              )}
              {product.discount && (
                <p className="text-xs text-red-500 font-medium">-{product.discount}% off</p>
              )}
            </div>
          </div>

          {product.colors.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Color</p>
              <div className="flex gap-2">
                {product.colors.map((color) => (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => setSelectedColor(color.value)}
                    className={`size-8 rounded-full border-2 transition-all ${
                      selectedColor === color.value
                        ? 'border-foreground scale-110'
                        : 'border-border hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                    aria-label={color.name}
                  />
                ))}
              </div>
            </div>
          )}

          {product.sizes.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">Size</p>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setSelectedSize(size)}
                    className={`px-4 py-2 text-sm font-medium rounded-md border transition-colors ${
                      selectedSize === size
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground'
                    }`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button className="w-full gap-2" disabled={!selectedSize} onClick={onClose}>
            <ShoppingBag className="size-4" />
            {selectedSize ? 'Add to Cart' : 'Select a Size'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
