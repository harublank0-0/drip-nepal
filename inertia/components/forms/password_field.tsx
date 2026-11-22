import { useState } from 'react'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '~/components/ui/input-group'
import { t } from '~/lib/i18n'

/*
 * A labelled password input with a show and hide button (docs/08 §3.1
 * "Sign up, log in": show password; §9.3 SC 3.3.8). Paste is never blocked,
 * and `autoComplete` names the password for password managers
 * (`new-password` on sign-up and reset, `current-password` on sign-in). The
 * button names what it does ("Show password"), and its visible word is part
 * of that name (SC 2.5.3). Help text and errors are joined in
 * `aria-describedby`, as in `TextField`.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  autoComplete,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
  autoComplete: 'new-password' | 'current-password'
}) {
  const [shown, setShown] = useState(false)
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
      <InputGroup>
        <InputGroupInput
          id={id}
          name={id}
          type={shown ? 'text' : 'password'}
          value={value}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        <InputGroupAddon align="inline-end">
          {/* `sm` keeps the Button's 32 px height; the default `xs` is 24 px (08 §6.4). */}
          <InputGroupButton
            size="sm"
            aria-label={shown ? t('common.form.hide_password') : t('common.form.show_password')}
            aria-controls={id}
            onClick={() => setShown((current) => !current)}
          >
            {shown ? t('common.form.hide') : t('common.form.show')}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
