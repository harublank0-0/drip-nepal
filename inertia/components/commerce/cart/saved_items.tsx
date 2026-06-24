import { motion, AnimatePresence } from 'framer-motion'
import { Trash2, ShoppingBag } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import type { SavedItem } from '~/types/cart'

type SavedItemsProps = {
  items: SavedItem[]
  onMoveToCart: (item: SavedItem) => void
  onRemove: (id: string) => void
}

export function SavedItems({ items, onMoveToCart, onRemove }: SavedItemsProps) {
  if (items.length === 0) return null

  return (
    <div className="border-t border-border/50 pt-6 mt-6">
      <h3 className="text-sm font-semibold mb-4">Saved Items ({items.length})</h3>
      <div className="divide-y divide-border/50">
        <AnimatePresence mode="popLayout">
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="flex gap-3 py-3"
            >
              <div className="size-[64px] shrink-0 overflow-hidden rounded-lg bg-muted">
                <img
                  src={item.image}
                  alt={item.name}
                  className="size-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                <h4 className="text-sm font-medium leading-tight truncate">{item.name}</h4>
                <p className="text-[11px] text-muted-foreground">{item.storeName}</p>
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {item.color && <span>{item.color}</span>}
                  {item.color && item.size && <span className="text-muted-foreground/40">|</span>}
                  {item.size && <span>{item.size}</span>}
                </div>
              </div>
              <div className="flex flex-col items-end justify-center gap-1.5 shrink-0">
                <span className="text-sm font-semibold tabular-nums">
                  Rs. {item.price.toLocaleString('ne-NP')}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onMoveToCart(item)}
                    aria-label={`Move ${item.name} to cart`}
                    className="size-7 text-muted-foreground hover:text-foreground"
                  >
                    <ShoppingBag className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(item.id)}
                    aria-label={`Remove ${item.name} from saved`}
                    className="size-7 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <Separator className="mt-4" />
    </div>
  )
}
