import type { Ref } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'

/*
 * The one TOTP code input (docs/08 §7.3 rule 5, §9.3 SC 3.3.8; docs/07
 * §3.9): one field, never split per digit, with `autocomplete="one-time-code"`
 * and the numeric keyboard on phones (§6.5). Paste is never blocked, and
 * the value is sent with its spaces and hyphens removed (`totpInput`), so
 * "123 456" copied from an authenticator app works. Help text and errors
 * are joined in `aria-describedby`, as in `TextField`. `ref` (a prop in
 * React 19) lets a dialog move focus here when the field appears (§9.1).
 */
export function TotpField({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  ref,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  errors: unknown[]
  description?: string
  ref?: Ref<HTMLInputElement>
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
        ref={ref}
        id={id}
        name={id}
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        autoCapitalize="off"
        spellCheck={false}
        maxLength={16}
        className="max-w-48 font-mono tracking-widest"
        value={value}
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
