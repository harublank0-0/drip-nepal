import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { Problem } from '@shared/api/problem'
import type { StatusChange } from '@shared/ui/courier_account_changes'
import { COURIER_LIMITS } from '@shared/constants/limits'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { ConfirmDialog } from '~/components/common/confirm_dialog'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { TextareaField } from '~/components/forms/textarea_field'

/*
 * Suspend, resume or disable a courier account (`adminSetLogisticsAccountStatus`,
 * step-up; docs/06 §13.8) in a `ConfirmDialog` (docs/08 §7.3): suspending
 * and resuming are tier 1; disabling erases the credentials for good, so it
 * is tier 2, with the account's name typed to confirm. The reason is required
 * and kept in the audit log (§7.1 permanent notes). A refusal keeps the
 * dialog open with the typed reason; a 404 or 409 also reloads the list,
 * because the account changed meanwhile (§8.3).
 */
const KEYS = {
  suspended: 'suspend',
  pending: 'resume',
  disabled: 'disable',
} as const

const FIELDS = [{ name: 'reason', id: 'status-reason' }] as const
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
  account: { id: string; name: string }
  change: StatusChange
  open: boolean
  onOpenChange: (open: boolean) => void
  // The account's new status, so the caller knows whether its menu stays.
  onChanged: (status: string) => void
  onCloseAutoFocus: (event: Event) => void
}) {
  const mutation = useApiMutation()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const key = KEYS[change]

  const form = useForm({
    defaultValues: { reason: '' },
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
      const outcome = await mutation.run(() =>
        client.request('adminSetLogisticsAccountStatus', {
          params: { accountId: account.id },
          body: { status: change, reason: value.reason.trim() },
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
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
        return
      }
      setProblem(outcome.problem)
      // The codes ProblemAlert words as "the list has been updated".
      if (['NOT_FOUND', 'INVALID_STATE_TRANSITION'].includes(outcome.problem.code)) {
        router.reload({ only: ['accounts'] })
      }
    },
  })

  function close() {
    form.reset()
    report.clear()
    setProblem(null)
    setOffline(false)
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
      pending={mutation.pending}
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
      <ProblemAlert problem={problem} offline={offline} entity="courier_account" />
    </ConfirmDialog>
  )
}
