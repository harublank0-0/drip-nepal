import { SearchSlash } from 'lucide-react'
import { TrendingSearches } from './trending_searches'

type NoResultsProps = {
  query: string
  onSearch: (query: string) => void
}

const fallbackTrending = ['Hoodies', 'Sneakers', 'Cargo Pants']

export function NoResults({ query, onSearch }: NoResultsProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="size-12 rounded-full bg-muted flex items-center justify-center mb-4">
        <SearchSlash className="size-5 text-muted-foreground/60" />
      </div>
      <p className="text-base font-medium">No results for &ldquo;{query}&rdquo;</p>
      <p className="text-sm text-muted-foreground mt-1 mb-6">
        Try adjusting your search or browse these trending searches
      </p>
      <div className="w-full max-w-sm">
        <TrendingSearches items={fallbackTrending} onSearch={onSearch} />
      </div>
    </div>
  )
}
