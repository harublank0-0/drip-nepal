import { Link } from '@adonisjs/inertia/react'
import { PackageOpen, SearchX } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { ListingContext } from '../types'

type EmptyStateProps = {
  context: ListingContext
  hasFilters: boolean
  onClearFilters: () => void
  /*
   * Set when the requested page is past the last one.
   */
  firstPageUrl?: string
}

function copyFor(context: ListingContext, hasFilters: boolean, pastLastPage: boolean) {
  if (pastLastPage) {
    return {
      title: 'This page is empty',
      body: 'There are fewer products here than this page number suggests.',
    }
  }
  if (hasFilters) {
    return {
      title: 'Nothing matches these filters',
      body: 'Try removing a size or color, or widening the price range.',
    }
  }
  if (context.kind === 'search' && context.query) {
    return {
      title: `No results for “${context.query}”`,
      body: 'Check the spelling, or try a broader word like “hoodie” or “sneakers”.',
    }
  }
  if (context.kind === 'store') {
    return {
      title: 'No products listed yet',
      body: `${context.title} hasn't put anything up for sale yet. Check back soon.`,
    }
  }
  return {
    title: 'Nothing here yet',
    body: 'Check back soon, or browse the rest of the shop.',
  }
}

export function EmptyState({ context, hasFilters, onClearFilters, firstPageUrl }: EmptyStateProps) {
  const { title, body } = copyFor(context, hasFilters, Boolean(firstPageUrl))
  const Icon = hasFilters || context.kind === 'search' ? SearchX : PackageOpen

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-20 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-muted">
        <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {firstPageUrl ? (
          <Button variant="outline" size="lg" asChild>
            <Link href={firstPageUrl}>Back to the first page</Link>
          </Button>
        ) : hasFilters ? (
          <Button variant="outline" size="lg" onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : (
          <>
            <Button variant="outline" size="lg" asChild>
              <Link route="men">Shop men</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link route="women">Shop women</Link>
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
