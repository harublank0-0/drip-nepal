import type { ValueState } from '@shared/ui/variant_selection'
import { t } from '~/lib/i18n'

/*
 * The product page's option axes (docs/08 §4.3 `VariantPicker`, §9, §11.2;
 * 01 AC-FR-SRCH-004-2; 02 AC-J02-04; R1-S part 3d-ii-b). Each axis is one
 * radio group of native radio inputs drawn as chips: they render and work
 * before JavaScript, Tab enters a group on its chosen value (or the first
 * one that can be chosen) and leaves it, the arrow keys move and select,
 * and a value that cannot be chosen is `disabled`, so the arrows skip it.
 * Every value stays shown; one that cannot be chosen says why in words
 * ("Sold out", "Not available in Black"), never by colour or strike-through
 * alone, its accessible name carries the reason ("XL, sold out"), and the
 * line under the group lists them, so a keyboard user learns of them too.
 * A colour value shows its swatch and its name.
 */
type PickerAxis = {
  code: string
  name: string
  values: { code: string; label: string; swatch_hex: string | null }[]
}

export function VariantPicker({
  axes,
  states,
  selection,
  primaryLabel,
  onChoose,
}: {
  axes: PickerAxis[]
  states: ValueState[][]
  selection: Record<string, string>
  // The chosen primary value's label, for the secondary axis's reasons.
  primaryLabel: string | null
  onChoose: (axis: string, value: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      {axes.map((axis, index) => {
        const values = states[index]
        const reasonOf = (state: ValueState) =>
          state.reason === 'not_offered'
            ? t('storefront.product.value_not_available', { primary: primaryLabel ?? '' })
            : t('storefront.product.value_sold_out')
        const soldOut = values.filter((state) => state.reason === 'sold_out')
        const unavailable = values.filter((state) => state.reason === 'not_offered')
        const inPrimary = index > 0 && primaryLabel !== null
        const summaryId = `axis-${axis.code}-summary`
        return (
          <fieldset
            key={axis.code}
            aria-describedby={soldOut.length + unavailable.length > 0 ? summaryId : undefined}
          >
            <legend className="mb-2 text-sm font-medium">{axis.name}</legend>
            <div className="flex flex-wrap gap-2">
              {values.map((state) => {
                const swatch =
                  axis.values.find((value) => value.code === state.code)?.swatch_hex ?? null
                const id = `axis-${axis.code}-${state.code}`
                return (
                  <div key={state.code}>
                    <input
                      id={id}
                      type="radio"
                      name={`axis-${axis.code}`}
                      value={state.code}
                      checked={selection[axis.code] === state.code}
                      disabled={!state.selectable}
                      aria-label={
                        state.reason
                          ? t('storefront.product.value_with_reason', {
                              value: state.label,
                              reason: reasonOf(state).toLowerCase(),
                            })
                          : undefined
                      }
                      className="peer sr-only"
                      onChange={() => onChoose(axis.code, state.code)}
                    />
                    <label
                      htmlFor={id}
                      className="peer-checked:border-primary peer-checked:ring-primary peer-focus-visible:outline-ring flex min-h-11 cursor-pointer flex-col items-center justify-center rounded-md border px-3 py-1.5 text-sm peer-checked:ring-1 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-disabled:cursor-not-allowed peer-disabled:border-dashed md:min-h-9"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        {swatch ? (
                          <span
                            aria-hidden="true"
                            className="size-3.5 rounded-full border"
                            style={{ backgroundColor: swatch }}
                          />
                        ) : null}
                        {state.label}
                      </span>
                      {state.reason ? (
                        <span className="text-muted-foreground text-xs">{reasonOf(state)}</span>
                      ) : null}
                    </label>
                  </div>
                )
              })}
            </div>
            {soldOut.length + unavailable.length > 0 ? (
              <p id={summaryId} className="text-muted-foreground mt-2 text-xs">
                {soldOut.length > 0
                  ? inPrimary
                    ? t('storefront.product.summary_sold_out_in', {
                        primary: primaryLabel,
                        values: soldOut.map((state) => state.label).join(', '),
                      })
                    : t('storefront.product.summary_sold_out', {
                        values: soldOut.map((state) => state.label).join(', '),
                      })
                  : null}
                {soldOut.length > 0 && unavailable.length > 0 ? ' ' : null}
                {unavailable.length > 0
                  ? t('storefront.product.summary_not_available', {
                      primary: primaryLabel ?? '',
                      values: unavailable.map((state) => state.label).join(', '),
                    })
                  : null}
              </p>
            ) : null}
          </fieldset>
        )
      })}
    </div>
  )
}
