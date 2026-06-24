import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, Bookmark } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { QuantitySelector } from './quantity_selector'
import type { CartItem } from '~/types/cart'

type CartItemProps = {
  item: CartItem
  onUpdateQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  onSaveForLater: (id: string) => void
  isLoading?: boolean
}

export function CartItem({
  item,
  onUpdateQuantity,
  onRemove,
  onSaveForLater,
  isLoading = false,
}: CartItemProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [showActions, setShowActions] = useState(false)

  const handleRemove = () => {
    setIsRemoving(true)
    setTimeout(() => onRemove(item.id), 250)
  }

  return (
    <AnimatePresence>
      {!isRemoving && (
        <motion.div
          layout
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
          transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
          className="flex gap-4 py-5"
          onMouseEnter={() => setShowActions(true)}
          onMouseLeave={() => setShowActions(false)}
        >
          <div className="size-[100px] shrink-0 overflow-hidden rounded-xl bg-muted sm:size-[120px]">
            <img
              src={item.image}
              alt={item.name}
              className="size-full object-cover"
              loading="lazy"
            />
          </div>

          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium leading-tight">{item.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{item.storeName}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleRemove}
                aria-label={`Remove ${item.name} from cart`}
                className={`shrink-0 text-muted-foreground hover:text-destructive transition-opacity ${
                  showActions ? 'opacity-100' : 'opacity-0 sm:opacity-0'
                }`}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {item.color && <span>{item.color}</span>}
              {item.color && item.size && <span className="text-muted-foreground/40">|</span>}
              {item.size && <span>{item.size}</span>}
            </div>

            {!item.inStock && (
              <span className="text-[11px] font-medium text-destructive">Out of stock</span>
            )}

            <div className="flex items-end justify-between mt-auto pt-1">
              <div className="flex flex-col gap-2">
                <QuantitySelector
                  quantity={item.quantity}
                  onIncrease={() => onUpdateQuantity(item.id, item.quantity + 1)}
                  onDecrease={() => onUpdateQuantity(item.id, item.quantity - 1)}
                  isLoading={isLoading}
                  max={item.maxQuantity}
                />
                <button
                  onClick={() => onSaveForLater(item.id)}
                  className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`Save ${item.name} for later`}
                >
                  <Bookmark className="size-3" />
                  Save for later
                </button>
              </div>

              <div className="text-right">
                <p className="text-sm font-semibold tabular-nums">
                  Rs. {item.price.toLocaleString('ne-NP')}
                </p>
                {item.originalPrice && item.originalPrice > item.price && (
                  <p className="text-xs text-muted-foreground line-through tabular-nums">
                    Rs. {item.originalPrice.toLocaleString('ne-NP')}
                  </p>
                )}
                {item.quantity > 1 && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    Rs. {(item.price * item.quantity).toLocaleString('ne-NP')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
