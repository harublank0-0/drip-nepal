import { Clock, X } from 'lucide-react'

type RecentSearchesProps = {
  items: string[]
  onSearch: (query: string) => void
  onRemove: (item: string) => void
  onClear: () => void
}

/*
 * Terms this browser searched for recently (localStorage only).
 */
export function RecentSearches({ items, onSearch, onRemove, onClear }: RecentSearchesProps) {
  if (items.length === 0) return null

  return (
    <section aria-labelledby="recent-searches-heading">
      <div className="flex items-center justify-between px-2 py-1.5">
        <h3
          id="recent-searches-heading"
          className="text-xs font-medium tracking-wider text-muted-foreground uppercase"
        >
          Recent searches
        </h3>
        <button
          type="button"
          onClick={onClear}
          className="rounded text-xs text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Clear
        </button>
      </div>
      <ul className="mt-1 space-y-0.5">
        {items.map((item) => (
          <li key={item} className="group flex items-center rounded-lg hover:bg-muted/50">
            <button
              type="button"
              onClick={() => onSearch(item)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <Clock aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/60" />
              <span className="truncate">{item}</span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove “${item}” from recent searches`}
              className="mr-1 flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
