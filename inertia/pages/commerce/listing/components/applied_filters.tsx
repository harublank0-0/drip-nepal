import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { formatPrice } from '~/lib/format'
import type { FacetOption, ListingFacets, ListingFilters } from '../types'

type AppliedFiltersProps = {
  facets: ListingFacets
  filters: ListingFilters
  onRemove: (filter: 'sizes' | 'colors', slug: string) => void
  onPriceChange: (min: number | null, max: number | null) => void
  onClear: () => void
  onCategoryChange?: (category: string | null) => void
}

function labelFor(options: FacetOption[], slug: string) {
  return options.find((option) => option.slug === slug)?.label ?? slug
}

function priceLabel(min: number | null, max: number | null) {
  if (min !== null && max !== null) return `${formatPrice(min)} – ${formatPrice(max)}`
  if (min !== null) return `From ${formatPrice(min)}`
  return `Up to ${formatPrice(max ?? 0)}`
}

/*
 * The active filters as removable chips, plus "Clear all".
 */
export function AppliedFilters({
  facets,
  filters,
  onRemove,
  onPriceChange,
  onClear,
  onCategoryChange,
}: AppliedFiltersProps) {
  const chipsRef = useRef<HTMLDivElement>(null)
  const removedControl = useRef<HTMLButtonElement | null>(null)
  const chips = [
    ...(filters.category && onCategoryChange
      ? [
          {
            key: 'category',
            label:
              facets.categories.find((category) => category.slug === filters.category)?.name ??
              filters.category,
            onRemove: () => onCategoryChange(null),
          },
        ]
      : []),
    ...filters.sizes.map((slug) => ({
      key: `size-${slug}`,
      label: `Size ${labelFor(facets.sizes, slug)}`,
      onRemove: () => onRemove('sizes', slug),
    })),
    ...filters.colors.map((slug) => ({
      key: `color-${slug}`,
      label: labelFor(facets.colors, slug),
      onRemove: () => onRemove('colors', slug),
    })),
  ]

  if (filters.min !== null || filters.max !== null) {
    chips.push({
      key: 'price',
      label: priceLabel(filters.min, filters.max),
      onRemove: () => onPriceChange(null, null),
    })
  }

  const chipKeys = chips.map((chip) => chip.key).join(',')
  useEffect(() => {
    const control = removedControl.current
    if (!control || control.isConnected) return
    if (document.activeElement === document.body) {
      const next = chipsRef.current?.querySelector<HTMLButtonElement>('button')
      const target = next ?? document.getElementById('listing-results-heading')
      target?.focus({ preventScroll: true })
    }
    removedControl.current = null
  }, [chipKeys])

  if (chips.length === 0) return null

  return (
    <div
      ref={chipsRef}
      className="flex items-center gap-2 overflow-x-auto pt-3 pb-1 md:flex-wrap md:overflow-visible"
    >
      <span className="sr-only">Active filters:</span>
      {chips.map((chip) => (
        <button
          key={chip.key}
          type="button"
          onClick={(event) => {
            removedControl.current = event.currentTarget
            chip.onRemove()
          }}
          aria-label={`Remove filter ${chip.label}`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/50 pr-2.5 pl-3 text-xs font-medium whitespace-nowrap transition-colors outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-8"
        >
          {chip.label}
          <X aria-hidden="true" className="size-3 text-muted-foreground" />
        </button>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={(event) => {
          removedControl.current = event.currentTarget
          onClear()
        }}
        className="h-11 shrink-0 md:h-8"
      >
        Clear all
      </Button>
    </div>
  )
}
