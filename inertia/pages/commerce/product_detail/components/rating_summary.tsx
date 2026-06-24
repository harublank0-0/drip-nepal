import type { ProductData } from '../mock'

type RatingSummaryProps = {
  reviews: ProductData['reviews']
  rating: number
  reviewCount: number
}

function getBreakdown(reviews: ProductData['reviews']) {
  const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 }
  reviews.forEach((r) => {
    const star = Math.round(r.rating)
    if (star >= 1 && star <= 5) counts[star as keyof typeof counts]++
  })
  const max = Math.max(...Object.values(counts), 1)
  return Object.entries(counts)
    .reverse()
    .map(([stars, count]) => ({
      stars: Number(stars),
      count,
      pct: (count / reviews.length) * 100,
      barPct: (count / max) * 100,
    }))
}

export function RatingSummary({ reviews, rating, reviewCount }: RatingSummaryProps) {
  const breakdown = getBreakdown(reviews)

  return (
    <div className="flex flex-col sm:flex-row gap-8 sm:gap-12 p-6 rounded-2xl bg-muted/30 ring-1 ring-foreground/5">
      <div className="text-center sm:text-left flex-shrink-0">
        <div className="text-5xl font-bold font-heading">{rating}</div>
        <div
          className="flex justify-center sm:justify-start gap-0.5 mt-2"
          aria-label={`${rating} out of 5 stars`}
        >
          {[1, 2, 3, 4, 5].map((s) => (
            <svg
              key={s}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={s <= Math.round(rating) ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="1.5"
              className={s <= Math.round(rating) ? 'text-amber-500' : 'text-muted-foreground/30'}
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          ))}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{reviewCount} reviews</p>
      </div>

      <div className="flex-1 space-y-2 min-w-0">
        {breakdown.map((b) => (
          <div key={b.stars} className="flex items-center gap-3 text-sm">
            <span className="w-8 text-right text-muted-foreground flex-shrink-0">{b.stars}</span>
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
              className="text-amber-500 flex-shrink-0"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-amber-500 transition-all duration-500"
                style={{ width: `${b.barPct}%` }}
              />
            </div>
            <span className="w-8 text-right text-muted-foreground flex-shrink-0 tabular-nums">
              {b.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
