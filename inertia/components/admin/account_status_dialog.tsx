import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { Problem } from '@shared/api/problem'
import type { StatusChange } from '@shared/ui/courier_account_changes'
import { COURIER_LIMITS } from '@shared/constants/limits'
import { TOTP_CODE_PATTERN, totpInput } from '@shared/constants/auth'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { useStepUp } from '~/hooks/use_step_up'
import { applyServerErrors, changeAndRecheck } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { ConfirmDialog } from '~/components/common/confirm_dialog'
import { ErrorSummary } from '~/components/forms/error_summary'
import { OwnShopCodeField } from '~/components/forms/own_shop_code_field'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { StepUpField } from '~/components/forms/step_up_field'
import { TextareaField } from '~/components/forms/textarea_field'

/*
 * Suspend, resume or disable a courier account (`adminSetLogisticsAccountStatus`,
 * step-up; docs/06 §13.8) in a `ConfirmDialog` (docs/08 §7.3): suspending
 * and resuming are tier 1; disabling erases the credentials for good, so it
 * is tier 2, with the account's name typed to confirm. The reason is required
 * and kept in the audit log (§7.1 permanent notes). A refusal keeps the
 * dialog open with the typed reason; a 404 or 409 also reloads the list,
 * because the account changed meanwhile (§8.3). A step-up refusal swaps in
 * the TOTP field (§7.3 rule 5, `useStepUp`): the next confirm verifies the
 * code, then sends the same change again. A shop-owned account of a shop the
 * staff member owns or works in needs a `totp_code` in the body under
 * single-operator mode (OD-44, R1-S part 1c-ii): the field shows from the
 * start when the page says so (`needs_totp_code`), or once the action
 * answers 422 on `totp_code`; that code also covers a stale step-up, so the
 * step-up field is then skipped. A wrong code empties the field.
 */
const KEYS = {
  suspended: 'suspend',
  pending: 'resume',
  disabled: 'disable',
} as const

const FIELDS = [
  { name: 'reason', id: 'status-reason' },
  { name: 'totp_code', id: 'status-totp-code' },
] as const
const KNOWN = new Set(FIELDS.map((field) => field.name))
const { min, max } = COURIER_LIMITS.reason

export function AccountStatusDialog({
  account,
  change,
  open,
  onOpenChange,
  onChanged,
  onCloseAutoFocus,
}: {
  account: { id: string; name: string; needs_totp_code?: boolean }
  change: StatusChange
  open: boolean
  onOpenChange: (open: boolean) => void
  // The account's new status, so the caller knows whether its menu stays.
  onChanged: (status: string) => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const mutation = useApiMutation()
  const stepUp = useStepUp()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  // The action asked for a code although the page did not know it would (a stale page).
  const [codeAsked, setCodeAsked] = useState(false)
  const askCode = account.needs_totp_code === true || codeAsked
  const key = KEYS[change]

  const form = useForm({
    defaultValues: { reason: '', totp_code: '' },
    canSubmitWhenInvalid: true,
    onSubmitInvalid: ({ formApi }) => {
      setProblem(null)
      setOffline(false)
      report.failed(formApi)
    },
    onSubmit: async ({ value, formApi }) => {
      setProblem(null)
      setOffline(false)
      report.clear()
      // A code in the body covers the step-up too (docs/07 §3.10).
      if (!askCode && !(await stepUp.ready())) return
      const outcome = await mutation.run(() =>
        client.request('adminSetLogisticsAccountStatus', {
          params: { accountId: account.id },
          body: {
            status: change,
            reason: value.reason.trim(),
            ...(askCode ? { totp_code: totpInput(value.totp_code) } : {}),
          },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        onChanged(outcome.data.data.status)
        close()
        toast.success(t(`admin.logistics.status.${key}.done`, { name: account.name }))
        router.reload({ only: ['accounts'] })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      if (outcome.problem.errors?.length) {
        const codeError = outcome.problem.errors.find((item) => item.field === 'totp_code')
        if (codeError) {
          setCodeAsked(true)
          if (codeError.code === 'code_incorrect') formApi.setFieldValue('totp_code', '')
        }
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
        return
      }
      // useApiMutation shows the wait next to the confirm button.
      if (outcome.problem.code === 'RATE_LIMITED') return
      if (stepUp.refused(outcome.problem)) return
      setProblem(outcome.problem)
      // The codes ProblemAlert words as "the list has been updated".
      if (['NOT_FOUND', 'INVALID_STATE_TRANSITION'].includes(outcome.problem.code)) {
        router.reload({ only: ['accounts'] })
      }
    },
  })

  function close() {
    form.reset()
    stepUp.reset()
    report.clear()
    setProblem(null)
    setOffline(false)
    setCodeAsked(false)
    onOpenChange(false)
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t(`admin.logistics.status.${key}.title`, { name: account.name })}
      consequence={t(`admin.logistics.status.${key}.consequence`)}
      confirmLabel={t(`admin.logistics.status.${key}.confirm`)}
      pendingLabel={t(`admin.logistics.status.${key}.pending`)}
      destructive={change !== 'pending'}
      identifier={change === 'disabled' ? account.name : undefined}
      identifierLabel={t('admin.logistics.status.disable.type_name', { name: account.name })}
      pending={mutation.pending || stepUp.pending}
      retryIn={Math.max(mutation.retryIn, stepUp.retryIn)}
      onConfirm={() => void form.handleSubmit()}
      onCloseAutoFocus={onCloseAutoFocus}
    >
      <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
      <form.Field
        name="reason"
        validators={{
          onBlur: ({ value }) =>
            value.trim().length < min || value.trim().length > max
              ? t('admin.logistics.status.reason_rule', { min, max })
              : undefined,
        }}
      >
        {(field) => (
          <TextareaField
            id="status-reason"
            label={t('admin.logistics.status.reason')}
            description={t('common.form.permanent_note')}
            value={field.state.value}
            maxLength={max}
            errors={field.state.meta.errors}
            onChange={(value) => changeAndRecheck(field, value)}
            onBlur={field.handleBlur}
          />
        )}
      </form.Field>
      {askCode && (
        <form.Field
          name="totp_code"
          validators={{
            onSubmit: ({ value }) =>
              TOTP_CODE_PATTERN.test(totpInput(value)) ? undefined : t('common.step_up.code_rule'),
          }}
        >
          {(field) => (
            <OwnShopCodeField
              id="status-totp-code"
              value={field.state.value}
              errors={field.state.meta.errors}
              onChange={(value) => field.handleChange(value)}
              onBlur={field.handleBlur}
            />
          )}
        </form.Field>
      )}
      <StepUpField view={stepUp.view} fieldRef={stepUp.fieldRef} id="status-step-up" />
      <ProblemAlert problem={problem} offline={offline} entity="courier_account" />
    </ConfirmDialog>
  )
}
