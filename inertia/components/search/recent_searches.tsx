import { Search, Clock, X } from 'lucide-react'

type RecentSearchesProps = {
  items: string[]
  onSearch: (query: string) => void
  onRemove: (item: string) => void
}

export function RecentSearches({ items, onSearch, onRemove }: RecentSearchesProps) {
  if (items.length === 0) return null

  return (
    <div>
      <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Recent Searches
      </h3>
      <div className="mt-1 space-y-0.5">
        {items.map((item) => (
          <div
            key={item}
            className="group flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer"
            onClick={() => onSearch(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSearch(item)
            }}
            aria-label={`Search for ${item}`}
          >
            <Clock className="size-4 text-muted-foreground/50" />
            <span className="flex-1 text-sm">{item}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRemove(item)
              }}
              className="opacity-0 group-hover:opacity-100 size-6 flex items-center justify-center rounded-full hover:bg-muted transition-all"
              aria-label={`Remove ${item} from recent searches`}
            >
              <X className="size-3.5 text-muted-foreground/50" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
