import { motion } from 'framer-motion'
import { Truck } from 'lucide-react'
import { FREE_SHIPPING_THRESHOLD } from '~/lib/mock-data/cart'

type FreeShippingProgressProps = {
  subtotal: number
  remaining: number
}

export function FreeShippingProgress({ subtotal, remaining }: FreeShippingProgressProps) {
  const progress = Math.min((subtotal / FREE_SHIPPING_THRESHOLD) * 100, 100)
  const isFree = remaining === 0

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide uppercase text-muted-foreground">
        <Truck className="size-3.5" />
        <span>
          {isFree
            ? 'Free shipping unlocked!'
            : `You're Rs. ${remaining.toLocaleString('ne-NP')} away from free shipping`}
        </span>
      </div>
      <div className="relative h-[3px] w-full overflow-hidden rounded-full bg-muted">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-foreground"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
        />
      </div>
    </div>
  )
}
