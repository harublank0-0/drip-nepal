import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Star } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { cn } from '~/lib/utils'
import { RatingSummary } from './rating_summary'
import { ReviewCard } from './review_card'
import type { ProductData } from '../mock'

type ReviewSectionProps = {
  reviews: ProductData['reviews']
  rating: number
  reviewCount: number
}

const filters = [
  { id: 'all', label: 'All' },
  { id: 'with-photos', label: 'With Photos' },
  { id: '5-star', label: '5 Star' },
  { id: '4-star', label: '4 Star' },
  { id: 'most-recent', label: 'Most Recent' },
] as const

export function ReviewSection({ reviews, rating, reviewCount }: ReviewSectionProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all')

  const filteredReviews = useMemo(() => {
    let result = [...reviews]
    switch (activeFilter) {
      case 'with-photos':
        result = result.filter((r) => r.images.length > 0)
        break
      case '5-star':
        result = result.filter((r) => r.rating >= 5)
        break
      case '4-star':
        result = result.filter((r) => r.rating >= 4 && r.rating < 5)
        break
      case 'most-recent':
        result = result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        break
    }
    return result
  }, [reviews, activeFilter])

  return (
    <section aria-label="Customer reviews" className="py-12 md:py-16">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-2xl md:text-3xl font-heading font-bold">Customer Reviews</h2>
        <Button variant="outline" className="gap-2 cursor-pointer">
          <Star className="size-4" />
          Write a Review
        </Button>
      </div>

      <RatingSummary reviews={reviews} rating={rating} reviewCount={reviewCount} />

      {/* Filters */}
      <div
        className="flex gap-2 mt-8 overflow-x-auto pb-2 scrollbar-none"
        role="tablist"
        aria-label="Filter reviews"
      >
        {filters.map((filter) => (
          <button
            key={filter.id}
            onClick={() => setActiveFilter(filter.id)}
            role="tab"
            aria-selected={activeFilter === filter.id}
            className={cn(
              'flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring',
              activeFilter === filter.id
                ? 'bg-foreground text-background'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Review List */}
      <div className="mt-6 space-y-4">
        {filteredReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-12">
            No reviews match this filter.
          </p>
        ) : (
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="space-y-4"
          >
            {filteredReviews.map((review, i) => (
              <ReviewCard key={review.id} review={review} index={i} />
            ))}
          </motion.div>
        )}
      </div>
    </section>
  )
}
