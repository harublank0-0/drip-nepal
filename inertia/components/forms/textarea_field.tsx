import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Textarea } from '~/components/ui/textarea'

/*
 * A labelled multi-line input (docs/08 §7.1), as `TextField`: the help text
 * and the errors are joined in `aria-describedby`, each only while shown.
 */
export function TextareaField({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  maxLength,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
  maxLength?: number
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
      <Textarea
        id={id}
        name={id}
        value={value}
        maxLength={maxLength}
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={describedBy || undefined}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
