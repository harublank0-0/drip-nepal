/*
 * Which option values a customer can choose on the product page, and the
 * variant a choice names (docs/08 §11.2; 01 AC-FR-SRCH-004-2 and -3; 02
 * AC-J02-04; R1-S part 3d-ii-b). Derived from the page's props only, never
 * by asking the server per click.
 *
 * With two axes the first is the primary one (the server sends colour
 * first, because the gallery follows colour), so the current size never
 * blocks the colour the customer wants:
 *
 * - a primary value is selectable when some variant with it is in stock,
 *   else sold out;
 * - before a primary value is chosen, a secondary value is selectable when
 *   some variant with it is in stock, else sold out;
 * - after it, a secondary value is not offered when no variant has both,
 *   sold out when that variant has no stock, else selectable.
 *
 * With one axis a value is selectable when its variant is in stock. Every
 * value stays shown; the server sends only the values some variant offers.
 */
export type SelectionAxis = { code: string; values: { code: string; label: string }[] }
export type SelectionVariant = {
  id: string
  option_values: Record<string, string>
  in_stock: boolean
}
// Axis code → chosen value code.
export type Selection = Record<string, string>

export type ValueState = {
  code: string
  label: string
  selectable: boolean
  reason: 'sold_out' | 'not_offered' | null
}

const offering = (variants: SelectionVariant[], code: string, value: string) =>
  variants.filter((variant) => variant.option_values[code] === value)

function stateOf(code: string, label: string, variants: SelectionVariant[]): ValueState {
  if (variants.length === 0) return { code, label, selectable: false, reason: 'not_offered' }
  return variants.some((variant) => variant.in_stock)
    ? { code, label, selectable: true, reason: null }
    : { code, label, selectable: false, reason: 'sold_out' }
}

export function axisStates(
  axes: SelectionAxis[],
  variants: SelectionVariant[],
  selection: Selection
): ValueState[][] {
  const primary = axes[0]
  return axes.map((axis, index) =>
    axis.values.map((value) => {
      const withValue = offering(variants, axis.code, value.code)
      const chosenPrimary = primary ? selection[primary.code] : undefined
      if (index === 0 || chosenPrimary === undefined) {
        return stateOf(value.code, value.label, withValue)
      }
      return stateOf(
        value.code,
        value.label,
        withValue.filter((variant) => variant.option_values[primary.code] === chosenPrimary)
      )
    })
  )
}

// The variant the selection names: the default one without axes, else the one matching every axis.
export function selectedVariant<T extends SelectionVariant>(
  axes: SelectionAxis[],
  variants: T[],
  selection: Selection
): T | null {
  if (axes.length === 0) return variants[0] ?? null
  return (
    variants.find((variant) =>
      axes.every((axis) => variant.option_values[axis.code] === selection[axis.code])
    ) ?? null
  )
}

/*
 * Choosing a value. When the primary value changes and the chosen
 * secondary value is no longer selectable with it, that choice is cleared,
 * and `cleared` names it for the announcement (08 §11.2).
 */
export function choose(
  axes: SelectionAxis[],
  variants: SelectionVariant[],
  selection: Selection,
  axisCode: string,
  valueCode: string
): {
  selection: Selection
  cleared: { axis: string; value: string; reason: 'sold_out' | 'not_offered' } | null
} {
  const next: Selection = { ...selection, [axisCode]: valueCode }
  const [primary, secondary] = axes
  if (!primary || !secondary || axisCode !== primary.code) return { selection: next, cleared: null }
  const chosen = next[secondary.code]
  if (chosen === undefined) return { selection: next, cleared: null }
  const state = axisStates(axes, variants, next)[1].find((value) => value.code === chosen)
  if (!state || state.selectable) return { selection: next, cleared: null }
  delete next[secondary.code]
  return {
    selection: next,
    cleared: { axis: secondary.code, value: chosen, reason: state.reason ?? 'sold_out' },
  }
}

// The selection a variant names, as the server's preselected `?variant=` gives it.
export function selectionOf(axes: SelectionAxis[], variant: SelectionVariant | null): Selection {
  if (!variant) return {}
  return Object.fromEntries(
    axes
      .filter((axis) => variant.option_values[axis.code] !== undefined)
      .map((axis) => [axis.code, variant.option_values[axis.code]])
  )
}
