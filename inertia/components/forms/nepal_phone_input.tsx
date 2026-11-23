import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '~/components/ui/input-group'
import { t } from '~/lib/i18n'

/*
 * `NepalPhoneInput` (docs/08 §4.3): a Nepali mobile number on the
 * `input-group` primitive, with the country code shown before the field.
 * It takes the number as people write it, `98XXXXXXXX` with or without
 * `+977` or `977`, spaces and hyphens; the form checks it with the shared
 * rule of shared/format/phone.ts (`^9[678]\d{8}$` once the prefix is
 * dropped, AC-FR-IAM-001-5) and sends it in E.164. `type="tel"`,
 * `inputMode="tel"` and `autocomplete="tel-national"` (08 §6.5). The shop's
 * numbers on the settings page (R1-S part 1b) also take landlines
 * (AC-FR-SHOP-001-3), checked with `toNepalShopPhoneE164`, and pass
 * `autoComplete="off"`: a shop's number is entered separately, never filled
 * in from the user's own (AC-FR-SHOP-001-4). Help text and errors are
 * joined in `aria-describedby`.
 */
export function NepalPhoneInput({
  id,
  label,
  value,
  onChange,
  onBlur,
  errors,
  description,
  autoComplete = 'tel-national',
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  onBlur: () => void
  errors: unknown[]
  description?: string
  autoComplete?: 'tel-national' | 'off'
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
      <InputGroup>
        <InputGroupAddon>
          {/* A visual cue only; the label and help text say what to type. */}
          <InputGroupText aria-hidden="true">{t('common.form.nepal_country_code')}</InputGroupText>
        </InputGroupAddon>
        <InputGroupInput
          id={id}
          name={id}
          type="tel"
          inputMode="tel"
          autoComplete={autoComplete}
          value={value}
          aria-invalid={messages.length > 0 || undefined}
          aria-describedby={describedBy || undefined}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
      </InputGroup>
      {description && <FieldDescription id={`${id}-help`}>{description}</FieldDescription>}
      <FieldError id={`${id}-error`} errors={messages.map((message) => ({ message }))} />
    </Field>
  )
}
