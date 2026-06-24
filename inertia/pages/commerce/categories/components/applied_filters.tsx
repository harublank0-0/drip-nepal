import { X } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import type { FilterState } from '../mock'

type AppliedFiltersProps = {
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
}

export function AppliedFilters({ filters, onFilterChange }: AppliedFiltersProps) {
  const chips: { label: string; onRemove: () => void }[] = []

  filters.brands.forEach((brand) => {
    chips.push({
      label: brand,
      onRemove: () =>
        onFilterChange({ ...filters, brands: filters.brands.filter((b) => b !== brand) }),
    })
  })

  filters.stores.forEach((store) => {
    chips.push({
      label: store,
      onRemove: () =>
        onFilterChange({ ...filters, stores: filters.stores.filter((s) => s !== store) }),
    })
  })

  filters.sizes.forEach((size) => {
    chips.push({
      label: `Size: ${size}`,
      onRemove: () =>
        onFilterChange({ ...filters, sizes: filters.sizes.filter((s) => s !== size) }),
    })
  })

  colorsToNames(filters.colors).forEach(({ value, name }) => {
    chips.push({
      label: name,
      onRemove: () =>
        onFilterChange({ ...filters, colors: filters.colors.filter((c) => c !== value) }),
    })
  })

  if (filters.discount !== null) {
    chips.push({
      label: `${filters.discount}%+ off`,
      onRemove: () => onFilterChange({ ...filters, discount: null }),
    })
  }

  if (filters.rating !== null) {
    chips.push({
      label: `${filters.rating}★+`,
      onRemove: () => onFilterChange({ ...filters, rating: null }),
    })
  }

  if (filters.inStock === true) {
    chips.push({
      label: 'In Stock',
      onRemove: () => onFilterChange({ ...filters, inStock: null }),
    })
  } else if (filters.inStock === false) {
    chips.push({
      label: 'Out of Stock',
      onRemove: () => onFilterChange({ ...filters, inStock: null }),
    })
  }

  if (filters.priceRange[0] !== filters.priceRange[1] && chips.length === 0) {
    return null
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">
      {chips.map((chip) => (
        <Badge key={chip.label} variant="secondary" className="gap-1 px-3 py-1 text-xs">
          {chip.label}
          <button onClick={chip.onRemove} aria-label={`Remove ${chip.label} filter`}>
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-muted-foreground h-7 px-2"
        onClick={() =>
          onFilterChange({
            ...filters,
            brands: [],
            stores: [],
            sizes: [],
            colors: [],
            discount: null,
            rating: null,
            inStock: null,
          })
        }
      >
        Clear All
      </Button>
    </div>
  )
}

const colorNameMap: Record<string, string> = {
  '#1a1a1a': 'Black',
  '#ffffff': 'White',
  '#696969': 'Grey',
  '#2d2d2d': 'Charcoal',
  '#c4a882': 'Beige',
  '#5b4a3b': 'Khaki',
  '#4a6fa5': 'Navy',
  '#2d5a27': 'Forest',
  '#cc2936': 'Red',
  '#8b4513': 'Brown',
}

function colorsToNames(colors: string[]): { value: string; name: string }[] {
  return colors.map((c) => ({ value: c, name: colorNameMap[c] || c }))
}
