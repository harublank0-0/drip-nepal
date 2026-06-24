import { cn } from '~/lib/utils'
import type { SearchSuggestion } from './types'

type SuggestionListProps = {
  suggestions: SearchSuggestion[]
  selectedIndex: number
  onSelect: (index: number) => void
}

const typeLabel = {
  product: 'Products',
  store: 'Stores',
  category: 'Categories',
}

export function SuggestionList({ suggestions, selectedIndex, onSelect }: SuggestionListProps) {
  return (
    <div className="space-y-0.5">
      {suggestions.map((s, i) => (
        <button
          key={`${s.text}-${i}`}
          onClick={() => onSelect(i)}
          className={cn(
            'w-full flex items-center gap-3 px-2 py-2 rounded-lg text-sm text-left transition-colors',
            selectedIndex === i ? 'bg-muted' : 'hover:bg-muted/50'
          )}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="text-muted-foreground/50 shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <span className="flex-1">{s.text}</span>
          <span className="text-[10px] uppercase text-muted-foreground/50 tracking-wider">
            {typeLabel[s.type]}
          </span>
        </button>
      ))}
    </div>
  )
}
