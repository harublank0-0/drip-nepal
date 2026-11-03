import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import { ArrowUpRight } from 'lucide-react'
import { cn } from '~/lib/utils'
import type { OptionRowProps } from './types'

type StoreResultCardProps = OptionRowProps & {
  store: Data.StoreCard
}

export function StoreResultCard({ store, id, isActive, onHover, onSelect }: StoreResultCardProps) {
  return (
    <Link
      route="stores.show"
      routeParams={{ slug: store.slug }}
      id={id}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      onMouseMove={onHover}
      onClick={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-lg px-2 py-2 transition-colors',
        isActive ? 'bg-muted' : 'hover:bg-muted/50'
      )}
    >
      {store.logo ? (
        <img
          src={store.logo}
          alt=""
          className="size-10 shrink-0 rounded-full object-cover ring-1 ring-foreground/10"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary font-heading font-bold text-primary-foreground"
        >
          {store.name.charAt(0).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{store.name}</p>
        <p className="text-xs text-muted-foreground">
          {store.productCount} {store.productCount === 1 ? 'product' : 'products'}
        </p>
      </div>
      <ArrowUpRight aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  )
}
