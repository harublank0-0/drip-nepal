import { Link } from '@adonisjs/inertia/react'
import { ArrowRight, SearchIcon } from 'lucide-react'
import { cn } from '~/lib/utils'
import { ProductResultCard } from './product_result_card'
import { StoreResultCard } from './store_result_card'
import type { SearchOption } from './types'

type SearchResultsProps = {
  listboxId: string
  options: SearchOption[]
  activeIndex: number
  term: string
  onHover: (index: number) => void
  onSelect: () => void
}

const headingClass = 'px-2 pb-1 text-xs font-medium tracking-wider text-muted-foreground uppercase'

/*
 * Product and store suggestions plus a "see all results" row, rendered as a
 * listbox driven by the modal's input (aria-activedescendant).
 */
export function SearchResults({
  listboxId,
  options,
  activeIndex,
  term,
  onHover,
  onSelect,
}: SearchResultsProps) {
  const products = options.flatMap((option, index) =>
    option.type === 'product' ? [{ option, index }] : []
  )
  const stores = options.flatMap((option, index) =>
    option.type === 'store' ? [{ option, index }] : []
  )
  const seeAll = options.flatMap((option, index) =>
    option.type === 'all' ? [{ option, index }] : []
  )

  return (
    <div id={listboxId} role="listbox" aria-label="Search suggestions" className="space-y-4">
      {products.length > 0 && (
        <div role="group" aria-labelledby={`${listboxId}-products`}>
          <h3 id={`${listboxId}-products`} className={headingClass}>
            Products
          </h3>
          {products.map(({ option, index }) => (
            <ProductResultCard
              key={option.id}
              id={option.id}
              product={option.product}
              isActive={index === activeIndex}
              onHover={() => onHover(index)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {stores.length > 0 && (
        <div role="group" aria-labelledby={`${listboxId}-stores`}>
          <h3 id={`${listboxId}-stores`} className={headingClass}>
            Stores
          </h3>
          {stores.map(({ option, index }) => (
            <StoreResultCard
              key={option.id}
              id={option.id}
              store={option.store}
              isActive={index === activeIndex}
              onHover={() => onHover(index)}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}

      {seeAll.map(({ option, index }) => (
        <Link
          key={option.id}
          href={option.href}
          id={option.id}
          role="option"
          aria-selected={index === activeIndex}
          tabIndex={-1}
          onMouseMove={() => onHover(index)}
          onClick={onSelect}
          className={cn(
            'flex items-center gap-3 rounded-lg border-t border-border px-2 py-3 text-sm transition-colors',
            index === activeIndex ? 'bg-muted' : 'hover:bg-muted/50'
          )}
        >
          <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          <span className="min-w-0 flex-1 truncate">
            See all results for <span className="font-medium">“{term}”</span>
          </span>
          <ArrowRight aria-hidden="true" className="size-4 text-muted-foreground" />
        </Link>
      ))}
    </div>
  )
}
