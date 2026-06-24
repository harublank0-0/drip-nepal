import { useState } from 'react'
import { motion } from 'framer-motion'
import { ThumbsUp, BadgeCheck } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import type { ProductReview } from '../mock'

type ReviewCardProps = {
  review: ProductReview
  index: number
}

export function ReviewCard({ review, index }: ReviewCardProps) {
  const [helpfulCount, setHelpfulCount] = useState(review.helpful)
  const [isHelpful, setIsHelpful] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.08 }}
      className="p-5 rounded-2xl ring-1 ring-foreground/5 bg-card"
    >
      <div className="flex items-start gap-3">
        <img
          src={review.user.avatar}
          alt={review.user.name}
          className="size-10 rounded-full object-cover ring-2 ring-background flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">{review.user.name}</span>
            {review.purchased && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                <BadgeCheck className="size-3" />
                Purchased
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <span className="flex gap-0.5" aria-label={`${review.rating} out of 5 stars`}>
              {[1, 2, 3, 4, 5].map((s) => (
                <svg
                  key={s}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill={s <= review.rating ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className={s <= review.rating ? 'text-amber-500' : 'text-muted-foreground/30'}
                >
                  <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                </svg>
              ))}
            </span>
            <span className="text-xs text-muted-foreground">
              {new Date(review.date).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>
          </div>

          <p className="text-sm leading-relaxed mt-3">{review.comment}</p>

          {review.images.length > 0 && (
            <div className="flex gap-2 mt-3">
              {review.images.map((img, i) => (
                <img
                  key={i}
                  src={img}
                  alt={`Review photo ${i + 1}`}
                  className="size-16 rounded-lg object-cover ring-1 ring-foreground/10 cursor-pointer hover:ring-2 hover:ring-primary transition-all"
                />
              ))}
            </div>
          )}

          <div className="mt-3">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'gap-1.5 text-xs cursor-pointer',
                isHelpful ? 'text-primary' : 'text-muted-foreground'
              )}
              onClick={() => {
                setIsHelpful(!isHelpful)
                setHelpfulCount((c) => c + (isHelpful ? -1 : 1))
              }}
              aria-label={
                isHelpful
                  ? `Mark not helpful. ${helpfulCount} people found this helpful`
                  : `Mark helpful. ${helpfulCount} people found this helpful`
              }
            >
              <ThumbsUp className={cn('size-3.5', isHelpful && 'fill-primary')} />
              Helpful ({helpfulCount})
            </Button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
