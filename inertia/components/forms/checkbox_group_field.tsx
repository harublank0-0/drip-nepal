import { Checkbox } from '~/components/ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '~/components/ui/field'

/*
 * A labelled group of checkboxes for a choice of several values (docs/08
 * §7.1; the multi-value product attributes of FR-CAT-007, such as audience
 * and material; R1-S part 2f-i): a `fieldset` whose `legend` names the
 * choice, one checkbox per option with its label beside it, in a grid that
 * wraps on phones. The help text and the errors belong to the group: each
 * box carries them in `aria-describedby` while shown. `id` is the first
 * box's, so the error summary's link and a failed submit's focus land on the
 * group.
 */
export function CheckboxGroupField({
  id,
  legend,
  options,
  value,
  onChange,
  onBlur,
  errors,
  description,
}: {
  id: string
  legend: string
  options: { value: string; label: string }[]
  value: readonly string[]
  onChange: (value: string[]) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
}) {
  const messages = errors.filter((error): error is string => typeof error === 'string')
  const describedBy = [
    description ? `${id}-help` : null,
    messages.length > 0 ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')
  const chosen = new Set(value)
  return (
    <FieldSet data-invalid={messages.length > 0 || undefined} className="gap-3">
      <FieldLegend variant="label">{legend}</FieldLegend>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {options.map((option, index) => {
          const boxId = index === 0 ? id : `${id}-${option.value}`
          return (
            <Field key={option.value} orientation="horizontal">
              <Checkbox
                id={boxId}
                checked={chosen.has(option.value)}
                aria-invalid={messages.length > 0 || undefined}
                aria-describedby={describedBy || undefined}
                onCheckedChange={(next) => {
                  const rest = value.filter((code) => code !== option.value)
                  onChange(next === true ? [...rest, option.value] : rest)
                }}
                onBlur={onBlur}
              />
              <FieldLabel htmlFor={boxId} className="font-normal">
                {option.label}
              </FieldLabel>
            </Field>
          )
        })}
      </div>
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </FieldSet>
  )
}
