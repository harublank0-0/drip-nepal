import { useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { Problem } from '@shared/api/problem'
import type { StatusChange } from '@shared/ui/courier_account_changes'
import { splitServerErrors } from '@shared/api/problem'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { messageFor } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '~/components/ui/alert-dialog'
import { ProblemAlert } from '~/components/forms/problem_alert'

/*
 * Suspend, resume or disable a courier account (`adminSetLogisticsAccountStatus`,
 * step-up; docs/06 §13.8). The confirmation follows docs/08 §7.3: suspending
 * and resuming are tier 1 (the consequence in one sentence, Cancel focused);
 * disabling erases the credentials for good, so it is tier 2: the confirm
 * button stays disabled until the account's name is typed, and that field
 * takes focus. The reason is required and kept in the audit log (§7.1
 * permanent notes). A refusal keeps the dialog open with the typed reason.
 */

const KEYS = {
  suspended: 'suspend',
  pending: 'resume',
  disabled: 'disable',
} as const

export function AccountStatusDialog({
  account,
  change,
  onClose,
}: {
  account: { id: string; name: string }
  change: StatusChange
  onClose: () => void
}) {
  const mutation = useApiMutation()
  const key = KEYS[change]
  const typeToConfirm = change === 'disabled'
  const [reason, setReason] = useState('')
  const [typed, setTyped] = useState('')
  const [reasonErrors, setReasonErrors] = useState<string[]>([])
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)
  const typedField = useRef<HTMLInputElement>(null)

  const matches = typed.trim().toLowerCase() === account.name.trim().toLowerCase()
  const reasonOk = reason.trim().length >= 3 && reason.trim().length <= 500

  async function confirm() {
    setProblem(null)
    setOffline(false)
    if (!reasonOk) {
      setReasonErrors([t('admin.logistics.status.reason_rule')])
      return
    }
    const outcome = await mutation.run(() =>
      client.request('adminSetLogisticsAccountStatus', {
        params: { accountId: account.id },
        body: { status: change, reason: reason.trim() },
        timeout: 30_000,
      })
    )
    if (!outcome) return
    if (outcome.ok) {
      onClose()
      toast.success(t(`admin.logistics.status.${key}.done`, { name: account.name }))
      router.reload({ only: ['accounts'] })
      return
    }
    if ('offline' in outcome) {
      setOffline(true)
      return
    }
    const { fields, formLevel } = splitServerErrors(
      outcome.problem,
      new Set(['reason']),
      messageFor
    )
    if (fields.size > 0 || formLevel.length > 0) {
      setReasonErrors([...(fields.get('reason') ?? []), ...formLevel])
    } else {
      setProblem(outcome.problem)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent
        onOpenAutoFocus={(event) => {
          if (!typeToConfirm) return
          event.preventDefault()
          typedField.current?.focus()
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`admin.logistics.status.${key}.title`, { name: account.name })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(`admin.logistics.status.${key}.consequence`)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void confirm()
          }}
        >
          <Field data-invalid={reasonErrors.length > 0 || undefined}>
            <FieldLabel htmlFor="status-reason">{t('admin.logistics.status.reason')}</FieldLabel>
            <Textarea
              id="status-reason"
              value={reason}
              maxLength={500}
              aria-invalid={reasonErrors.length > 0 || undefined}
              aria-describedby="status-reason-help status-reason-error"
              onChange={(event) => {
                // A server or client message clears once the reason is edited (08 §7.1).
                setReason(event.target.value)
                setReasonErrors([])
              }}
            />
            <FieldDescription id="status-reason-help">
              {t('common.form.permanent_note')}
            </FieldDescription>
            <FieldError
              id="status-reason-error"
              errors={reasonErrors.map((message) => ({ message }))}
            />
          </Field>
          {typeToConfirm && (
            <Field>
              <FieldLabel htmlFor="status-confirm">
                {t('admin.logistics.status.disable.type_name', { name: account.name })}
              </FieldLabel>
              <Input
                id="status-confirm"
                ref={typedField}
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            </Field>
          )}
          <ProblemAlert problem={problem} offline={offline} />
          <AlertDialogFooter>
            <AlertDialogCancel type="button">{t('common.form.cancel')}</AlertDialogCancel>
            <Button
              type="submit"
              variant={change === 'pending' ? 'default' : 'destructive'}
              disabled={mutation.pending || (typeToConfirm && !matches)}
            >
              {t(`admin.logistics.status.${key}.confirm`)}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
