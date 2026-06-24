import { Button } from '~/components/ui/button'
import { SearchX, RefreshCw } from 'lucide-react'

type EmptyStateProps = {
  onClearFilters: () => void
}

export function EmptyState({ onClearFilters }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <SearchX className="size-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-1">No products found</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Try adjusting your filters or search criteria to find what you&apos;re looking for.
      </p>
      <Button variant="outline" onClick={onClearFilters} className="gap-2">
        <RefreshCw className="size-4" />
        Clear Filters
      </Button>
    </div>
  )
}
