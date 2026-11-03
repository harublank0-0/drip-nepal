import { cn } from '~/lib/utils'
import type { OptionValue, VariantOption } from '../hooks/use_variant_selection'

/*
 * Swatches for the color names shops use. Unknown names render as a plain
 * text chip.
 */
const SWATCHES: Record<string, string> = {
  beige: '#d9c8a9',
  black: '#111111',
  blue: '#2563eb',
  brown: '#7c4a2d',
  charcoal: '#36454f',
  cream: '#f3ead3',
  emerald: '#10b981',
  gold: '#d4af37',
  green: '#2f7d32',
  grey: '#8a8a8a',
  gray: '#8a8a8a',
  indigo: '#3f51b5',
  khaki: '#c3b091',
  maroon: '#800000',
  mustard: '#d4a017',
  navy: '#1f2a44',
  olive: '#708238',
  orange: '#f97316',
  pink: '#ec4899',
  purple: '#7e22ce',
  red: '#dc2626',
  sage: '#9caf88',
  sky: '#7dd3fc',
  teal: '#0d9488',
  white: '#ffffff',
  yellow: '#facc15',
}

type VariantSelectorProps = {
  sizes: OptionValue[]
  colors: OptionValue[]
  selectedSize: string | null
  selectedColor: string | null
  onSelect: (option: VariantOption, value: string) => void
}

export function VariantSelector({
  sizes,
  colors,
  selectedSize,
  selectedColor,
  onSelect,
}: VariantSelectorProps) {
  if (sizes.length === 0 && colors.length === 0) return null

  return (
    <div id="product-options" className="scroll-mt-28 space-y-6">
      {colors.length > 0 && (
        <OptionGroup
          label="Color"
          values={colors}
          selected={selectedColor}
          otherSelected={selectedSize}
          onSelect={(value) => onSelect('color', value)}
          renderValue={(value) => (
            <>
              {SWATCHES[value.toLowerCase()] && (
                <span
                  className="size-4 shrink-0 rounded-full ring-1 ring-foreground/20"
                  style={{ backgroundColor: SWATCHES[value.toLowerCase()] }}
                  aria-hidden="true"
                />
              )}
              {value}
            </>
          )}
        />
      )}

      {sizes.length > 0 && (
        <OptionGroup
          label="Size"
          values={sizes}
          selected={selectedSize}
          otherSelected={selectedColor}
          onSelect={(value) => onSelect('size', value)}
          renderValue={(value) => value}
        />
      )}
    </div>
  )
}

type OptionGroupProps = {
  label: string
  values: OptionValue[]
  selected: string | null
  otherSelected: string | null
  onSelect: (value: string) => void
  renderValue: (value: string) => React.ReactNode
}

function OptionGroup({
  label,
  values,
  selected,
  otherSelected,
  onSelect,
  renderValue,
}: OptionGroupProps) {
  return (
    <div role="group" aria-labelledby={`option-${label}`}>
      <p id={`option-${label}`} className="mb-3 text-sm font-medium">
        {label}
        {selected ? (
          <span className="ml-1 font-normal text-muted-foreground">: {selected}</span>
        ) : (
          <span className="ml-1 font-normal text-muted-foreground">
            : select a {label.toLowerCase()}
          </span>
        )}
      </p>

      <div className="flex flex-wrap gap-2">
        {values.map((option) => {
          const isSelected = option.value === selected
          const isAvailable = option.exists && option.inStock
          const reason = !option.exists
            ? `not available in ${otherSelected}`
            : !option.inStock
              ? 'out of stock'
              : null

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onSelect(option.value)}
              disabled={!isAvailable && !isSelected}
              aria-pressed={isSelected}
              aria-label={reason ? `${option.value}, ${reason}` : option.value}
              title={reason ? `${option.value}: ${reason}` : undefined}
              className={cn(
                'inline-flex h-10 min-w-12 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-medium transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                isSelected
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border bg-background hover:border-foreground/50',
                !isAvailable &&
                  !isSelected &&
                  'cursor-not-allowed border-dashed text-muted-foreground/60 line-through hover:border-border'
              )}
            >
              {renderValue(option.value)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
