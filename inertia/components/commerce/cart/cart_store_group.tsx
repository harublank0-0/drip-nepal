import { motion } from 'framer-motion'
import { Separator } from '~/components/ui/separator'
import type { GroupedCartItems, CartItem } from '~/types/cart'

type CartStoreGroupProps = {
  group: GroupedCartItems
  children: (item: CartItem) => React.ReactNode
}

export function CartStoreGroup({ group, children }: CartStoreGroupProps) {
  return (
    <motion.div layout className="py-2">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-6 shrink-0 overflow-hidden rounded-full bg-muted">
          <img
            src={group.storeLogo}
            alt={group.storeName}
            className="size-full object-cover"
            loading="lazy"
          />
        </div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-medium truncate">{group.storeName}</span>
          <span className="text-[10px] text-muted-foreground">
            {group.items.length} {group.items.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      <div className="divide-y divide-border/50">
        {group.items.map((item, index) => (
          <div key={item.id}>
            {children(item)}
            {index < group.items.length - 1 && <Separator className="bg-border/30" />}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
