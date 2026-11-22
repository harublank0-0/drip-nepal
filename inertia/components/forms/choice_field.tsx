import { Field, FieldError, FieldLabel } from '~/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

/*
 * A labelled choice from a short list (docs/08 §7.1), on the `select`
 * primitive; the trigger carries the label's id.
 */
export function ChoiceField<V extends string>({
  id,
  label,
  value,
  options,
  onChange,
  errors,
}: {
  id: string
  label: string
  value: V
  options: { value: V; label: string }[]
  onChange: (value: V) => void
  errors: unknown[]
}) {
  const messages = errors.filter((error): error is string => typeof error === 'string')
  return (
    <Field data-invalid={messages.length > 0 || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as V)}>
        <SelectTrigger
          id={id}
          className="w-full"
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={messages.length > 0 ? `${id}-error` : undefined}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
