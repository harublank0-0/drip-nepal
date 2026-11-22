import type { ReactNode } from 'react'
import { Checkbox } from '~/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '~/components/ui/field'

/*
 * A labelled checkbox (docs/08 §7.1) on the `checkbox` primitive, with the
 * label beside the box; the help text and the errors are joined in
 * `aria-describedby`, each only while shown, as in `TextField`. The box
 * starts as `checked` says: consent boxes start unticked (FR-IAM-013,
 * 08 §1.1 "Honest commerce").
 */
export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  onBlur,
  errors,
  description,
}: {
  id: string
  label: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
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
  return (
    <Field orientation="horizontal" data-invalid={messages.length > 0 || undefined}>
      <Checkbox
        id={id}
        checked={checked}
        aria-invalid={messages.length > 0 || undefined}
        aria-describedby={describedBy || undefined}
        onCheckedChange={(next) => onChange(next === true)}
        onBlur={onBlur}
      />
      <FieldContent>
        <FieldLabel htmlFor={id} className="font-normal">
          {label}
        </FieldLabel>
        {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
        <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
      </FieldContent>
    </Field>
  )
}
