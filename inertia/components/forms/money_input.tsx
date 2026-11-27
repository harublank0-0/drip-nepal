import type { KeyboardEvent } from 'react'
import { NPR_DISPLAY_PREFIX } from '@shared/format/money'
import { t } from '~/lib/i18n'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '~/components/ui/input-group'

/*
 * `MoneyInput` (docs/08 §4.3; R1-S part 2f-ii): a labelled amount in rupees
 * with the "Rs" prefix (`NPR_DISPLAY_PREFIX`, VX-12), the phone's decimal
 * keyboard (`inputmode="decimal"`, 08 §6.5), and the value kept as typed.
 * The form turns it into integer paisa with the shared
 * `parseRupeesToMinor` (grouping commas dropped, at most two decimals,
 * never a float; 04 §18.1, ADR-0007), so this field never holds a number.
 * The help text and the errors are joined in `aria-describedby`, as in
 * `TextField`. In a grid, `labelClassName` can hide the label on wide
 * screens, where a column header names the field, and `describedBy` adds
 * the row's name to what a screen reader announces. The prefix is a visual
 * cue, so the label says "in rupees" to screen readers. `onKeyDown` lets a
 * caller give Enter its own meaning (the "every variant" fill).
 */
export function MoneyInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  labelClassName,
  describedBy: extraDescribedBy,
  onKeyDown,
  unnamed = false,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
  labelClassName?: string
  describedBy?: string
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
  // No `name`, so a form submitted without JavaScript does not send the rupees.
  unnamed?: boolean
}) {
  const messages = errors.filter((error): error is string => typeof error === 'string')
  const describedBy = [
    extraDescribedBy ?? null,
    description ? `${id}-help` : null,
    messages.length > 0 ? `${id}-error` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <Field data-invalid={messages.length > 0 || undefined}>
      <FieldLabel htmlFor={id} className={labelClassName}>
        {label}
        <span className="sr-only"> {t('common.form.in_rupees')}</span>
      </FieldLabel>
      <InputGroup className="h-11 lg:h-9">
        <InputGroupAddon>
          {/* A visual cue only; the label says the amount is in rupees. */}
          <InputGroupText aria-hidden="true">{NPR_DISPLAY_PREFIX}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          name={unnamed ? undefined : id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={describedBy || undefined}
          className="text-base lg:text-sm"
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onKeyDown}
        />
      </InputGroup>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
