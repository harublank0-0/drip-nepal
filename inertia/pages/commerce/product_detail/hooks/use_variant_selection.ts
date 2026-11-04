import { useState } from 'react'
import type { Data } from '@generated/data'

export type ProductVariant = NonNullable<Data.Product['variants']>[number]
export type VariantOption = 'size' | 'color'

export type OptionValue = {
  value: string
  /* A variant with this value exists next to the other selected option. */
  exists: boolean
  /* At least one of those variants has stock. */
  inStock: boolean
}

export type PriceSummary = {
  price: number
  comparePrice: number | null
  /* Prices differ across the variants still in play, so show "From". */
  isFrom: boolean
}

/*
 * What the add-to-cart button can do right now.
 * - unavailable: the product has no variants to sell
 * - sold_out: every variant has 0 stock
 * - incomplete: an option still needs to be picked
 * - out_of_stock: the picked variant has 0 stock
 * - ready: the picked variant can be added
 */
export type PurchaseState = 'unavailable' | 'sold_out' | 'incomplete' | 'out_of_stock' | 'ready'

type Selection = { size: string | null; color: string | null }

export const LOW_STOCK_THRESHOLD = 5

function distinctValues(variants: ProductVariant[], option: VariantOption) {
  const values: string[] = []
  for (const variant of variants) {
    const value = variant[option]
    if (value !== null && !values.includes(value)) values.push(value)
  }
  return values
}

function initialSelection(variants: ProductVariant[], sizes: string[], colors: string[]) {
  if (variants.length === 1) {
    return { size: variants[0].size, color: variants[0].color }
  }

  return {
    size: sizes.length === 1 ? sizes[0] : null,
    color: colors.length === 1 ? colors[0] : null,
  }
}

function cheapestOf(variants: ProductVariant[]) {
  return variants.reduce<ProductVariant | null>(
    (min, variant) => (!min || variant.price < min.price ? variant : min),
    null
  )
}

/*
 * Derives the size and color pickers from the product's variants and keeps
 * track of what the shopper picked. An option value is only selectable when
 * a variant with it exists next to the other picked option and has stock, so
 * a complete selection always lands on a variant that can be bought.
 */
export function useVariantSelection(allVariants: ProductVariant[] | undefined) {
  const variants = (allVariants ?? []).filter((variant) => variant.status === 'active')
  const sizeValues = distinctValues(variants, 'size')
  const colorValues = distinctValues(variants, 'color')
  const valuesFor = (option: VariantOption) => (option === 'size' ? sizeValues : colorValues)

  const [selection, setSelection] = useState<Selection>(() =>
    initialSelection(variants, sizeValues, colorValues)
  )
  const [quantity, setQuantity] = useState(1)

  const describe = (option: VariantOption, value: string): OptionValue => {
    const other: VariantOption = option === 'size' ? 'color' : 'size'
    const otherValue = selection[other]
    const matching = variants.filter(
      (variant) =>
        variant[option] === value && (otherValue === null || variant[other] === otherValue)
    )

    return {
      value,
      exists: matching.length > 0,
      inStock: matching.some((variant) => variant.quantity > 0),
    }
  }

  const missing: VariantOption[] = []
  if (sizeValues.length > 0 && selection.size === null) missing.push('size')
  if (colorValues.length > 0 && selection.color === null) missing.push('color')

  const fullyMatching = variants.filter(
    (variant) => variant.size === selection.size && variant.color === selection.color
  )
  const selectedVariant =
    missing.length === 0
      ? (fullyMatching.find((variant) => variant.quantity > 0) ?? fullyMatching[0] ?? null)
      : null

  /*
   * Price: the picked variant's, otherwise the cheapest in-stock variant that
   * still fits what has been picked so far.
   */
  const inPlay = selectedVariant
    ? [selectedVariant]
    : variants.filter(
        (variant) =>
          (selection.size === null || variant.size === selection.size) &&
          (selection.color === null || variant.color === selection.color)
      )
  const inPlayInStock = inPlay.filter((variant) => variant.quantity > 0)
  const pricePool = inPlayInStock.length > 0 ? inPlayInStock : inPlay
  const cheapest = cheapestOf(pricePool)
  const price: PriceSummary | null = cheapest
    ? {
        price: cheapest.price,
        comparePrice: cheapest.comparePrice,
        isFrom: pricePool.some((variant) => variant.price !== cheapest.price),
      }
    : null

  let state: PurchaseState = 'ready'
  if (variants.length === 0) state = 'unavailable'
  else if (variants.every((variant) => variant.quantity <= 0)) state = 'sold_out'
  else if (missing.length > 0) state = 'incomplete'
  else if (!selectedVariant || selectedVariant.quantity <= 0) state = 'out_of_stock'

  const maxQuantity = selectedVariant ? Math.max(selectedVariant.quantity, 0) : 0

  function select(option: VariantOption, value: string) {
    setSelection((current) => {
      // Clicking the picked value again clears it, unless it's the only one.
      const next = current[option] === value && valuesFor(option).length > 1 ? null : value
      return option === 'size' ? { ...current, size: next } : { ...current, color: next }
    })
    setQuantity(1)
  }

  function changeQuantity(next: number) {
    setQuantity(Math.min(Math.max(1, next), Math.max(maxQuantity, 1)))
  }

  return {
    sizes: sizeValues.map((value) => describe('size', value)),
    colors: colorValues.map((value) => describe('color', value)),
    selectedSize: selection.size,
    selectedColor: selection.color,
    selectedVariant,
    missing,
    price,
    state,
    quantity: Math.min(quantity, Math.max(maxQuantity, 1)),
    maxQuantity,
    select,
    changeQuantity,
  }
}

export type VariantSelection = ReturnType<typeof useVariantSelection>

/*
 * The add-to-cart label, which doubles as the reason the button is disabled.
 */
export function purchaseLabel(
  selection: Pick<VariantSelection, 'state' | 'missing'>,
  { short = false }: { short?: boolean } = {}
) {
  switch (selection.state) {
    case 'unavailable':
      return 'Unavailable'
    case 'sold_out':
    case 'out_of_stock':
      return 'Out of stock'
    case 'incomplete':
      if (selection.missing.length > 1) {
        return short ? 'Select options' : `Select a ${selection.missing.join(' and ')}`
      }
      return `Select a ${selection.missing[0]}`
    case 'ready':
      return 'Add to cart'
  }
}
