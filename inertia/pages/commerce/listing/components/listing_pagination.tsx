import { Link } from '@adonisjs/inertia/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { PaginationMeta } from '~/types/pagination'

type ListingPaginationProps = {
  meta: PaginationMeta
  pageUrl: (page: number) => string
}

/*
 * First, last and the pages around the current one, with gaps between.
 */
function pageWindow(current: number, last: number) {
  const pages = [...new Set([1, current - 1, current, current + 1, last])]
    .filter((page) => page >= 1 && page <= last)
    .sort((a, b) => a - b)

  const items: (number | 'gap')[] = []
  pages.forEach((page, index) => {
    if (index > 0 && page - pages[index - 1] > 1) items.push('gap')
    items.push(page)
  })
  return items
}

const itemClass =
  'inline-flex size-9 items-center justify-center rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50'

export function ListingPagination({ meta, pageUrl }: ListingPaginationProps) {
  if (meta.lastPage <= 1) return null

  const { currentPage, lastPage } = meta
  const hasPrevious = currentPage > 1
  const hasNext = currentPage < lastPage

  return (
    <nav aria-label="Pagination" className="mt-12 flex items-center justify-center gap-1">
      {hasPrevious ? (
        <Link
          href={pageUrl(currentPage - 1)}
          rel="prev"
          aria-label="Previous page"
          className={cn(itemClass, 'hover:bg-muted')}
        >
          <ChevronLeft className="size-4" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(itemClass, 'text-muted-foreground/40')}>
          <ChevronLeft className="size-4" />
        </span>
      )}

      {pageWindow(currentPage, lastPage).map((item, index) =>
        item === 'gap' ? (
          <span
            key={`gap-${index}`}
            aria-hidden="true"
            className={cn(itemClass, 'text-muted-foreground')}
          >
            …
          </span>
        ) : (
          <Link
            key={item}
            href={pageUrl(item)}
            aria-label={`Page ${item}`}
            aria-current={item === currentPage ? 'page' : undefined}
            className={cn(
              itemClass,
              item === currentPage
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item}
          </Link>
        )
      )}

      {hasNext ? (
        <Link
          href={pageUrl(currentPage + 1)}
          rel="next"
          aria-label="Next page"
          className={cn(itemClass, 'hover:bg-muted')}
        >
          <ChevronRight className="size-4" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(itemClass, 'text-muted-foreground/40')}>
          <ChevronRight className="size-4" />
        </span>
      )}
    </nav>
  )
}
