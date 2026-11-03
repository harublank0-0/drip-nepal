import { Link } from '@adonisjs/inertia/react'
import { cn } from '~/lib/utils'
import { FilterSection } from './filter_section'
import { PriceFilter } from './price_filter'
import type { ListingFacets, ListingFilters, ListingKind } from '../types'

/*
 * Swatches for the color names we know. Anything else shows as a plain chip.
 */
const SWATCHES: Record<string, string> = {
  black: '#111111',
  white: '#ffffff',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  charcoal: '#36454f',
  cream: '#f3ead3',
  beige: '#d8c3a5',
  khaki: '#b5a57a',
  brown: '#6b4423',
  mustard: '#d4a017',
  yellow: '#f2c94c',
  orange: '#e8743b',
  red: '#c62828',
  pink: '#e7a1b0',
  purple: '#6a4c93',
  blue: '#2f5d9b',
  navy: '#1f2a44',
  green: '#2e7d32',
  olive: '#6b6b2a',
  sage: '#9caf88',
  maroon: '#6d1a1a',
}

type FilterPanelProps = {
  kind: ListingKind
  facets: ListingFacets
  filters: ListingFilters
  onToggle: (filter: 'sizes' | 'colors', slug: string) => void
  onPriceChange: (min: number | null, max: number | null) => void
}

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-9 min-w-10 items-center justify-center gap-2 rounded-md border px-3 text-xs font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
    active
      ? 'border-foreground bg-foreground text-background'
      : 'border-border text-muted-foreground hover:border-foreground/50 hover:text-foreground'
  )

export function FilterPanel({ kind, facets, filters, onToggle, onPriceChange }: FilterPanelProps) {
  const showCategories = kind !== 'category' && facets.categories.length > 0
  const showPrice = facets.price.max > 0 || filters.min !== null || filters.max !== null

  return (
    <div>
      {showCategories && (
        <FilterSection title="Category">
          <ul className="-mx-2 space-y-0.5">
            {facets.categories.map((category) => (
              <li key={category.slug}>
                <Link
                  route="categories.show"
                  routeParams={{ slug: category.slug }}
                  className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span className="truncate">{category.name}</span>
                  <span className="text-xs tabular-nums">{category.productCount}</span>
                </Link>
              </li>
            ))}
          </ul>
        </FilterSection>
      )}

      {facets.sizes.length > 0 && (
        <FilterSection title="Size">
          <div role="group" aria-label="Size" className="flex flex-wrap gap-1.5">
            {facets.sizes.map((size) => {
              const active = filters.sizes.includes(size.slug)
              return (
                <button
                  key={size.slug}
                  type="button"
                  aria-pressed={active}
                  aria-label={`Size ${size.label}`}
                  onClick={() => onToggle('sizes', size.slug)}
                  className={chipClass(active)}
                >
                  {size.label}
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {facets.colors.length > 0 && (
        <FilterSection title="Color">
          <div role="group" aria-label="Color" className="flex flex-wrap gap-1.5">
            {facets.colors.map((color) => {
              const active = filters.colors.includes(color.slug)
              const swatch = SWATCHES[color.slug]
              return (
                <button
                  key={color.slug}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onToggle('colors', color.slug)}
                  className={cn(chipClass(active), swatch && 'pl-2')}
                >
                  {swatch && (
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-full ring-1 ring-foreground/25"
                      style={{ backgroundColor: swatch }}
                    />
                  )}
                  {color.label}
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {showPrice && (
        <FilterSection title="Price">
          <PriceFilter
            key={`${filters.min}:${filters.max}`}
            bounds={facets.price}
            min={filters.min}
            max={filters.max}
            onApply={onPriceChange}
          />
        </FilterSection>
      )}
    </div>
  )
}
