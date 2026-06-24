import { useState } from 'react'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import { Slider } from '~/components/ui/slider'
import { ScrollArea } from '~/components/ui/scroll_area'
import { FilterGroup } from './filter_group'
import {
  ALL_SIZES,
  ALL_COLORS,
  DISCOUNT_OPTIONS,
  RATING_OPTIONS,
  type FilterState,
  type Brand,
  type Store,
  type CategoryData,
} from '../mock'

type FilterSidebarProps = {
  data: CategoryData
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
}

export function FilterSidebar({ data, filters, onFilterChange }: FilterSidebarProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    price: true,
    size: true,
    color: true,
    brand: true,
    store: true,
    discount: true,
    rating: true,
    availability: true,
  })

  const toggle = (section: string) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }))
  }

  const update = (patch: Partial<FilterState>) => {
    onFilterChange({ ...filters, ...patch })
  }

  return (
    <div className="space-y-1">
      <h2 className="text-sm font-semibold mb-4">Filters</h2>

      <ScrollArea className="h-[calc(100vh-300px)]">
        <div className="space-y-0">
          {/* Price Range */}
          <FilterGroup
            label="Price Range"
            isOpen={openSections.price}
            onToggle={() => toggle('price')}
          >
            <div className="px-1 pt-2">
              <Slider
                min={data.minPrice}
                max={data.maxPrice}
                step={100}
                value={[filters.priceRange[0], filters.priceRange[1]]}
                onValueChange={([min, max]) => update({ priceRange: [min, max] })}
              />
              <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                <span>Rs. {filters.priceRange[0].toLocaleString()}</span>
                <span>Rs. {filters.priceRange[1].toLocaleString()}</span>
              </div>
            </div>
          </FilterGroup>

          {/* Size */}
          <FilterGroup label="Size" isOpen={openSections.size} onToggle={() => toggle('size')}>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ALL_SIZES.map((size) => {
                const active = filters.sizes.includes(size)
                return (
                  <button
                    key={size}
                    type="button"
                    onClick={() =>
                      update({
                        sizes: active
                          ? filters.sizes.filter((s) => s !== size)
                          : [...filters.sizes, size],
                      })
                    }
                    className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                      active
                        ? 'bg-foreground text-background border-foreground'
                        : 'bg-transparent text-muted-foreground border-border hover:border-foreground hover:text-foreground'
                    }`}
                  >
                    {size}
                  </button>
                )
              })}
            </div>
          </FilterGroup>

          {/* Color */}
          <FilterGroup label="Color" isOpen={openSections.color} onToggle={() => toggle('color')}>
            <div className="flex flex-wrap gap-2 pt-1">
              {ALL_COLORS.map((color) => {
                const active = filters.colors.includes(color.value)
                return (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() =>
                      update({
                        colors: active
                          ? filters.colors.filter((c) => c !== color.value)
                          : [...filters.colors, color.value],
                      })
                    }
                    className={`size-7 rounded-full border-2 transition-all ${
                      active ? 'border-foreground scale-110' : 'border-border hover:scale-105'
                    }`}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                    aria-label={`Color: ${color.name}`}
                  />
                )
              })}
            </div>
          </FilterGroup>

          {/* Brand */}
          <FilterGroup label="Brand" isOpen={openSections.brand} onToggle={() => toggle('brand')}>
            <div className="space-y-1.5 pt-1">
              {data.brands.map((brand) => (
                <Label
                  key={brand.id}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                >
                  <Checkbox
                    checked={filters.brands.includes(brand.name)}
                    onCheckedChange={() =>
                      update({
                        brands: filters.brands.includes(brand.name)
                          ? filters.brands.filter((b) => b !== brand.name)
                          : [...filters.brands, brand.name],
                      })
                    }
                  />
                  <span>{brand.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">({brand.count})</span>
                </Label>
              ))}
            </div>
          </FilterGroup>

          {/* Store */}
          <FilterGroup label="Store" isOpen={openSections.store} onToggle={() => toggle('store')}>
            <div className="space-y-1.5 pt-1">
              {data.stores.map((store) => (
                <Label
                  key={store.id}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                >
                  <Checkbox
                    checked={filters.stores.includes(store.name)}
                    onCheckedChange={() =>
                      update({
                        stores: filters.stores.includes(store.name)
                          ? filters.stores.filter((s) => s !== store.name)
                          : [...filters.stores, store.name],
                      })
                    }
                  />
                  <span className="flex items-center justify-center size-6 rounded-full bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
                    {store.logo}
                  </span>
                  <span>{store.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">({store.count})</span>
                </Label>
              ))}
            </div>
          </FilterGroup>

          {/* Discount */}
          <FilterGroup
            label="Discount"
            isOpen={openSections.discount}
            onToggle={() => toggle('discount')}
          >
            <div className="space-y-1.5 pt-1">
              {DISCOUNT_OPTIONS.map((opt) => (
                <Label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                >
                  <input
                    type="radio"
                    name="discount"
                    checked={filters.discount === opt.value}
                    onChange={() =>
                      update({ discount: filters.discount === opt.value ? null : opt.value })
                    }
                    className="size-4 accent-foreground"
                  />
                  <span>{opt.label}</span>
                </Label>
              ))}
            </div>
          </FilterGroup>

          {/* Rating */}
          <FilterGroup
            label="Rating"
            isOpen={openSections.rating}
            onToggle={() => toggle('rating')}
          >
            <div className="space-y-1.5 pt-1">
              {RATING_OPTIONS.map((opt) => (
                <Label
                  key={opt.value}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                >
                  <input
                    type="radio"
                    name="rating"
                    checked={filters.rating === opt.value}
                    onChange={() =>
                      update({ rating: filters.rating === opt.value ? null : opt.value })
                    }
                    className="size-4 accent-foreground"
                  />
                  <span className="text-yellow-500">{'★'.repeat(opt.value)}</span>
                  <span className="text-muted-foreground"> & above</span>
                </Label>
              ))}
            </div>
          </FilterGroup>

          {/* Availability */}
          <FilterGroup
            label="Availability"
            isOpen={openSections.availability}
            onToggle={() => toggle('availability')}
          >
            <div className="space-y-1.5 pt-1">
              {[
                { value: true as const, label: 'In Stock' },
                { value: false as const, label: 'Out of Stock' },
              ].map((opt) => (
                <Label
                  key={opt.label}
                  className="flex items-center gap-2 text-sm font-normal cursor-pointer"
                >
                  <input
                    type="radio"
                    name="availability"
                    checked={filters.inStock === opt.value}
                    onChange={() =>
                      update({ inStock: filters.inStock === opt.value ? null : opt.value })
                    }
                    className="size-4 accent-foreground"
                  />
                  <span>{opt.label}</span>
                </Label>
              ))}
            </div>
          </FilterGroup>
        </div>
      </ScrollArea>
    </div>
  )
}

export function MobileFilterContent({ data, filters, onFilterChange }: FilterSidebarProps) {
  return <FilterSidebar data={data} filters={filters} onFilterChange={onFilterChange} />
}
