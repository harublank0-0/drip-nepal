import type { HTMLAttributes, HTMLInputTypeAttribute } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'

/*
 * A labelled text input (docs/08 §7.1): the label's `htmlFor` matches the
 * input, and the help text and the errors are joined in
 * `aria-describedby`. `errors` are TanStack Form's field errors, client and
 * server alike. `inputMode` picks the phone keyboard (docs/08 §6.5): a
 * rupee amount takes `decimal`, a count of days `numeric`.
 */
export function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  type = 'text',
  autoComplete,
  inputMode,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
  type?: HTMLInputTypeAttribute
  autoComplete?: string
  inputMode?: HTMLAttributes<HTMLInputElement>['inputMode']
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
      <Input
        id={id}
        name={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        inputMode={inputMode}
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
