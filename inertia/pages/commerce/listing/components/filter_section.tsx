import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

type FilterSectionProps = {
  title: string
  children: ReactNode
}

/*
 * A collapsible filter group. Uses <details> so it works without
 * JavaScript and needs no state.
 */
export function FilterSection({ title, children }: FilterSectionProps) {
  return (
    <details open className="group border-b border-border py-4 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between rounded-md text-sm font-medium outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
        />
      </summary>
      <div className="pt-3">{children}</div>
    </details>
  )
}
