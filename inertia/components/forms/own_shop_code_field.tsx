import type { Ref } from 'react'
import { t } from '~/lib/i18n'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { TotpField } from '~/components/forms/totp_field'

/*
 * The `totp_code` an admin action on the staff member's own shop needs
 * under single-operator mode (OD-44's exception, docs/07 §4.1 rule 4, §4.7;
 * R1-S part 1c-ii): why the code is asked, and the one TOTP input
 * (`TotpField`). Unlike `StepUpField`, the code travels in the action's own
 * body, so it is spent with that one change and also covers a stale
 * step-up (07 §3.10). A dialog shows it when the page says the shop needs a
 * code, or when the action answers 422 on `totp_code`.
 */
export function OwnShopCodeField({
  id,
  value,
  onChange,
  onBlur,
  errors,
  ref,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  errors: unknown[]
  ref?: Ref<HTMLInputElement>
}) {
  return (
    <div className="space-y-3">
      <Alert role="status">
        <AlertTitle>{t('common.own_shop_code.title')}</AlertTitle>
        <AlertDescription>{t('common.own_shop_code.body')}</AlertDescription>
      </Alert>
      <TotpField
        ref={ref}
        id={id}
        label={t('common.step_up.code')}
        description={t('common.step_up.code_help')}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        errors={errors}
      />
    </div>
  )
}
