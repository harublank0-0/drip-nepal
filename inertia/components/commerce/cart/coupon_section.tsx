import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Tag, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'

type CouponSectionProps = {
  coupon: string | null
  onApplyCoupon: (code: string) => void
  onRemoveCoupon: () => void
}

export function CouponSection({ coupon, onApplyCoupon, onRemoveCoupon }: CouponSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [code, setCode] = useState('')

  const handleApply = () => {
    if (code.trim()) {
      onApplyCoupon(code.trim())
      setCode('')
      setIsOpen(false)
    }
  }

  return (
    <div className="border-t border-border/50 pt-4 mt-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={isOpen}
        aria-label="Toggle coupon input"
      >
        <Tag className="size-4" />
        <span>Have a coupon?</span>
        {isOpen ? (
          <ChevronUp className="size-3.5 ml-auto" />
        ) : (
          <ChevronDown className="size-3.5 ml-auto" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="flex gap-2 mt-3">
              <Input
                placeholder="Enter coupon code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleApply()}
                className="h-9 text-sm"
              />
              <Button size="sm" variant="outline" onClick={handleApply} className="shrink-0 h-9">
                Apply
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {coupon && (
        <div className="flex items-center gap-2 mt-2 text-xs text-green-600 dark:text-green-400">
          <Check className="size-3.5" />
          <span>Coupon &quot;{coupon}&quot; applied — 10% off</span>
          <button
            onClick={onRemoveCoupon}
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors underline"
          >
            Remove
          </button>
        </div>
      )}
    </div>
  )
}
