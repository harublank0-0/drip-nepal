import { useState, type ReactNode } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '~/components/ui/sheet'

type MobileFiltersProps = {
  activeCount: number
  total: number
  isUpdating: boolean
  onClear: () => void
  children: ReactNode
}

/*
 * The filter panel in a sheet for small screens. Filters apply as they are
 * picked; the sheet stays open until the shopper closes it.
 */
export function MobileFilters({
  activeCount,
  total,
  isUpdating,
  onClear,
  children,
}: MobileFiltersProps) {
  const [open, setOpen] = useState(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="h-11 gap-2 px-3 md:h-9">
          <SlidersHorizontal aria-hidden="true" />
          Filters
          {activeCount > 0 && (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">
              {activeCount}
              <span className="sr-only"> active</span>
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[88vw] max-w-sm gap-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle>Filters</SheetTitle>
          <SheetDescription>Narrow down by category, size, color and price.</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-4">{children}</div>
        <SheetFooter className="flex-row border-t border-border">
          <Button
            variant="outline"
            size="lg"
            className="flex-1"
            disabled={activeCount === 0}
            onClick={onClear}
          >
            Clear all
          </Button>
          <SheetClose asChild>
            <Button size="lg" className="flex-1" aria-live="polite">
              {isUpdating ? 'Updating…' : `Show ${total} ${total === 1 ? 'result' : 'results'}`}
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
