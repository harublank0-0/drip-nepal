import { X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { formatNPR } from '@shared/format/money'
import type { FacetOption, ListingFacets, ListingFilters } from '../types'

type AppliedFiltersProps = {
  facets: ListingFacets
  filters: ListingFilters
  onToggle: (filter: 'sizes' | 'colors', slug: string) => void
  onPriceChange: (min: number | null, max: number | null) => void
  onClear: () => void
}

function labelFor(options: FacetOption[], slug: string) {
  return options.find((option) => option.slug === slug)?.label ?? slug
}

// The URL's bounds are whole rupees.
function priceLabel(min: number | null, max: number | null) {
  const rupees = (value: number) => formatNPR(value * 100)
  if (min !== null && max !== null) return `${rupees(min)} – ${rupees(max)}`
  if (min !== null) return `From ${rupees(min)}`
  return `Up to ${rupees(max ?? 0)}`
}

/*
 * The active filters as removable chips, plus "Clear all".
 */
export function AppliedFilters({
  facets,
  filters,
  onToggle,
  onPriceChange,
  onClear,
}: AppliedFiltersProps) {
  const chips = [
    ...filters.sizes.map((slug) => ({
      key: `size-${slug}`,
      label: `Size ${labelFor(facets.sizes, slug)}`,
      onRemove: () => onToggle('sizes', slug),
    })),
    ...filters.colors.map((slug) => ({
      key: `color-${slug}`,
      label: labelFor(facets.colors, slug),
      onRemove: () => onToggle('colors', slug),
    })),
  ]

  if (filters.min !== null || filters.max !== null) {
    chips.push({
      key: 'price',
      label: priceLabel(filters.min, filters.max),
      onRemove: () => onPriceChange(null, null),
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 pt-4">
      <span className="sr-only">Active filters:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={chip.onRemove}
          aria-label={`Remove filter ${chip.label}`}
          className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border bg-muted/50 pr-2 pl-3 text-xs font-medium transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {chip.label}
          <X aria-hidden="true" className="size-3 text-muted-foreground" />
        </button>
      ))}
      <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
        Clear all
      </Button>
    </div>
  )
}
