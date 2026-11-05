import type { MouseEvent } from 'react'
import { SearchSlash } from 'lucide-react'
import { PopularCategories } from './popular_categories'

type NoResultsProps = {
  query: string
  onNavigate: (event: MouseEvent) => void
}

export function NoResults({ query, onNavigate }: NoResultsProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center px-4 pt-8 pb-2 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <SearchSlash aria-hidden="true" className="size-5 text-muted-foreground/60" />
        </div>
        <p className="text-base font-medium">No matches for &ldquo;{query}&rdquo;</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Try another word, or browse a category instead.
        </p>
      </div>
      <PopularCategories onNavigate={onNavigate} />
    </div>
  )
}
