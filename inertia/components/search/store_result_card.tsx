import { cn } from '~/lib/utils'
import type { StoreResult } from './types'

type StoreResultCardProps = {
  store: StoreResult
  isSelected?: boolean
}

export function StoreResultCard({ store, isSelected }: StoreResultCardProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 px-2 py-2.5 rounded-lg transition-colors cursor-pointer',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      <img
        src={store.logo}
        alt={store.name}
        className="size-10 rounded-full object-cover ring-1 ring-foreground/10"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{store.name}</p>
        <p className="text-xs text-muted-foreground">
          {(store.followerCount / 1000).toFixed(1)}K followers
        </p>
      </div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="text-amber-500"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
        {store.rating}
      </div>
    </div>
  )
}
