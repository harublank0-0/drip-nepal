import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '~/components/ui/sheet'
import { Button } from '~/components/ui/button'
import { SlidersHorizontal } from 'lucide-react'
import { MobileFilterContent } from './filter_sidebar'
import type { FilterState, CategoryData } from '../mock'

type MobileFilterDrawerProps = {
  data: CategoryData
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  resultCount: number
}

export function MobileFilterDrawer({
  data,
  filters,
  onFilterChange,
  resultCount,
}: MobileFilterDrawerProps) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="size-4" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] sm:w-[360px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <MobileFilterContent data={data} filters={filters} onFilterChange={onFilterChange} />
        </div>
        <div className="sticky bottom-0 bg-background pt-4 pb-2 border-t border-border mt-4">
          <p className="text-xs text-muted-foreground mb-2">{resultCount} products match</p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
