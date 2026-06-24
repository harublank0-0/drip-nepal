import { motion } from 'framer-motion'
import { Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { QuantitySelector } from './quantity_selector'
import type { CartItem } from '~/types/cart'

type CartDrawerItemProps = {
  item: CartItem
  onUpdateQuantity: (id: string, quantity: number) => void
  onRemove: (id: string) => void
  isLoading?: boolean
}

export function CartDrawerItem({
  item,
  onUpdateQuantity,
  onRemove,
  isLoading = false,
}: CartDrawerItemProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="flex gap-3 py-3"
    >
      <div className="size-[72px] shrink-0 overflow-hidden rounded-lg bg-muted">
        <img src={item.image} alt={item.name} className="size-full object-cover" loading="lazy" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="text-sm font-medium leading-tight truncate">{item.name}</h4>
            <p className="text-[11px] text-muted-foreground mt-0.5">{item.storeName}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => onRemove(item.id)}
            aria-label={`Remove ${item.name} from cart`}
            className="size-6 shrink-0 -mr-1 -mt-1 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          {item.color && <span>{item.color}</span>}
          {item.color && item.size && <span className="text-muted-foreground/40">|</span>}
          {item.size && <span>{item.size}</span>}
        </div>

        <div className="flex items-center justify-between mt-1">
          <QuantitySelector
            quantity={item.quantity}
            onIncrease={() => onUpdateQuantity(item.id, item.quantity + 1)}
            onDecrease={() => onUpdateQuantity(item.id, item.quantity - 1)}
            isLoading={isLoading}
            max={item.maxQuantity}
          />
          <div className="text-right">
            <span className="text-sm font-semibold tabular-nums">
              Rs. {item.price.toLocaleString('ne-NP')}
            </span>
            {item.originalPrice && item.originalPrice > item.price && (
              <span className="text-[11px] text-muted-foreground line-through ml-1.5 tabular-nums">
                Rs. {item.originalPrice.toLocaleString('ne-NP')}
              </span>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}
