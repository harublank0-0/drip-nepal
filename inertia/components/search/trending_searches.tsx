type TrendingSearchesProps = {
  items: string[]
  onSearch: (query: string) => void
}

export function TrendingSearches({ items, onSearch }: TrendingSearchesProps) {
  return (
    <div>
      <h3 className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        Trending
      </h3>
      <div className="mt-1 flex flex-wrap gap-2">
        {items.map((item) => (
          <button
            key={item}
            onClick={() => onSearch(item)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <span aria-hidden="true">🔥</span>
            {item}
          </button>
        ))}
      </div>
    </div>
  )
}
