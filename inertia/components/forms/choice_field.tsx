import { cn } from '~/lib/utils'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

/*
 * A labelled choice from a short list (docs/08 §7.1), on the `select`
 * primitive; the trigger carries the label's id, and the help text and the
 * errors in `aria-describedby`. An empty `value` shows `placeholder`, which
 * says why there is nothing to choose yet while `disabled` (the address
 * cascade: choose the province first). `triggerClassName` sizes the trigger
 * (44 px on the account forms, docs/08 §6.4). The list opens and closes
 * without animation: while an exit animation ran, the closing layer still
 * caught the next click outside it, and a checkbox pressed then logged a
 * React `flushSync` warning (found in the address form walk-through, M1
 * part 6b). `ComboboxField` does the same.
 */
export function ChoiceField<V extends string>({
  id,
  label,
  value,
  options,
  onChange,
  errors,
  placeholder,
  description,
  disabled = false,
  triggerClassName,
}: {
  id: string
  label: string
  value: V | ''
  options: { value: V; label: string }[]
  onChange: (value: V) => void
  errors: unknown[]
  placeholder?: string
  description?: string
  disabled?: boolean
  triggerClassName?: string
}) {
  const messages = errors.filter((error): error is string => typeof error === 'string')
  const describedBy = [
    description ? `${id}-help` : null,
    messages.length > 0 ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Field data-invalid={messages.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} disabled={disabled} onValueChange={(next) => onChange(next as V)}>
        <SelectTrigger
          id={id}
          className={cn('w-full', triggerClassName)}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={describedBy || undefined}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        {/* No animation: a closing list's layer would catch the next outside click. */}
        <SelectContent className="animate-none!">
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
