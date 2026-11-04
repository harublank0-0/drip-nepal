import { Link } from '@adonisjs/inertia/react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { PaginationMeta } from '~/types/pagination'

type PagerProps = {
  meta: PaginationMeta
  /*
   * Builds the URL for a page, keeping the current filters.
   */
  hrefFor: (page: number) => string
}

/*
 * Previous / next pagination for dashboard tables.
 */
export function Pager({ meta, hrefFor }: PagerProps) {
  if (meta.lastPage <= 1) return null

  const hasPrevious = meta.currentPage > 1
  const hasNext = meta.currentPage < meta.lastPage

  return (
    <div className="flex items-center justify-between gap-4 pt-4 text-sm text-muted-foreground">
      <span>
        Page {meta.currentPage} of {meta.lastPage} · {meta.total} total
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={!hasPrevious} asChild={hasPrevious}>
          {hasPrevious ? (
            <Link href={hrefFor(meta.currentPage - 1)} preserveScroll>
              <ChevronLeftIcon className="size-4" />
              Previous
            </Link>
          ) : (
            <span>
              <ChevronLeftIcon className="size-4" />
              Previous
            </span>
          )}
        </Button>
        <Button variant="outline" size="sm" disabled={!hasNext} asChild={hasNext}>
          {hasNext ? (
            <Link href={hrefFor(meta.currentPage + 1)} preserveScroll>
              Next
              <ChevronRightIcon className="size-4" />
            </Link>
          ) : (
            <span>
              Next
              <ChevronRightIcon className="size-4" />
            </span>
          )}
        </Button>
      </div>
    </div>
  )
}
