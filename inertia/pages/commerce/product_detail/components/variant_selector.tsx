import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '~/lib/utils'
import type { ProductColor, ProductSize } from '../mock'

type VariantSelectorProps = {
  colors: ProductColor[]
  sizes: ProductSize[]
}

export function VariantSelector({ colors, sizes }: VariantSelectorProps) {
  const [selectedColor, setSelectedColor] = useState<string | null>(null)
  const [selectedSize, setSelectedSize] = useState<string | null>(null)

  return (
    <div className="space-y-6">
      {/* Color Picker */}
      <fieldset>
        <legend className="text-sm font-medium mb-3">
          Color
          {selectedColor && (
            <span className="text-muted-foreground font-normal ml-1">
              — <span className="capitalize">{selectedColor}</span>
            </span>
          )}
        </legend>
        <div className="flex flex-wrap gap-3" role="radiogroup" aria-label="Select color">
          {colors.map((color) => {
            const isSelected = selectedColor === color.name
            return (
              <button
                key={color.name}
                onClick={() => setSelectedColor(color.name)}
                className={cn(
                  'relative size-10 rounded-full transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                  isSelected &&
                    'ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110'
                )}
                style={{ backgroundColor: color.value }}
                aria-label={`Color: ${color.name}`}
                aria-checked={isSelected}
                role="radio"
              >
                {isSelected && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute inset-0 flex items-center justify-center"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isLightColor(color.value) ? '#000' : '#fff'}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </motion.span>
                )}
              </button>
            )
          })}
        </div>
      </fieldset>

      {/* Size Picker */}
      <fieldset>
        <legend className="text-sm font-medium mb-3">
          Size
          {selectedSize && (
            <span className="text-muted-foreground font-normal ml-1">— {selectedSize}</span>
          )}
        </legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Select size">
          {sizes.map((size) => {
            const isSelected = selectedSize === size.label
            return (
              <motion.button
                key={size.label}
                onClick={() => size.available && setSelectedSize(size.label)}
                whileTap={size.available ? { scale: 0.95 } : undefined}
                disabled={!size.available}
                className={cn(
                  'relative min-w-[48px] h-10 px-4 rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                  isSelected
                    ? 'bg-foreground text-background scale-105'
                    : size.available
                      ? 'bg-muted hover:bg-muted/80 text-foreground'
                      : 'bg-muted/30 text-muted-foreground/40 cursor-not-allowed'
                )}
                aria-label={`Size: ${size.label}${!size.available ? ' — unavailable' : ''}`}
                aria-checked={isSelected}
                role="radio"
              >
                {size.label}
                {!size.available && (
                  <span
                    className="absolute inset-0 flex items-center justify-center pointer-events-none"
                    aria-hidden="true"
                  >
                    <svg width="100%" height="1" className="absolute text-muted-foreground/30">
                      <line
                        x1="0"
                        y1="50%"
                        x2="100%"
                        y2="50%"
                        stroke="currentColor"
                        strokeWidth="1.5"
                      />
                    </svg>
                  </span>
                )}
              </motion.button>
            )
          })}
        </div>
      </fieldset>
    </div>
  )
}

function isLightColor(hex: string) {
  const c = hex.replace('#', '')
  const r = Number.parseInt(c.substring(0, 2), 16)
  const g = Number.parseInt(c.substring(2, 4), 16)
  const b = Number.parseInt(c.substring(4, 6), 16)
  return (r * 299 + g * 587 + b * 114) / 1000 > 155
}
