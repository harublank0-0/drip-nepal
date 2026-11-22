import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { COURIER_LIMITS } from '@shared/constants/limits'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useIntentKey } from '~/hooks/use_intent_key'
import { useErrorReport } from '~/hooks/use_error_report'
import { applyServerErrors, changeAndRecheck } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '~/components/ui/dialog'
import { TextField } from '~/components/forms/text_field'
import { ChoiceField } from '~/components/forms/choice_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'

/*
 * Create DripNepal's own Nepal Can Move account (`adminCreateLogisticsAccount`
 * ⚷, step-up; docs/06 §13.8, OD-58). The key is made at the first submit
 * and kept across retries of the same values (docs/06 §7.1, docs/09 §13.4).
 * The token is sent once, stored encrypted and never shown again; the account
 * stays `pending` until NCM answers its test call. The dialog owns its
 * trigger, so focus returns to it on close (docs/08 §7.3 rule 1); closing
 * drops what was typed, the token included, and cannot happen mid-request.
 */
type Body = Route.Body<'adminCreateLogisticsAccount'>

// The body's own shape and paths, so a server error lands on its field (docs/08 §7.1).
type Values = {
  name: string
  environment: 'sandbox' | 'production'
  external_account_ref: string
  credentials: { token: string }
}

const EMPTY: Values = {
  name: '',
  environment: 'production',
  external_account_ref: '',
  credentials: { token: '' },
}

// In the form's order, with each input's id, for the error summary (docs/08 §7.1).
const FIELDS = [
  { name: 'name', id: 'account-name' },
  { name: 'environment', id: 'account-environment' },
  { name: 'external_account_ref', id: 'account-reference' },
  { name: 'credentials.token', id: 'account-token' },
] as const
const KNOWN = new Set(FIELDS.map((field) => field.name))

const { accountName, token } = COURIER_LIMITS

export function CreatePlatformAccountDialog() {
  const [open, setOpen] = useState(false)
  const mutation = useApiMutation()
  const intentKey = useIntentKey<Body>()
  const report = useErrorReport(FIELDS)
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values, so an error the user has just
    // fixed (a blur or server message still in state) never blocks the submit.
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
      const body: Body = {
        provider_code: 'ncm',
        name: value.name.trim(),
        environment: value.environment,
        external_account_ref: value.external_account_ref.trim() || null,
        credentials: { token: value.credentials.token },
      }
      const key = intentKey.for(body)
      const outcome = await mutation.run(() =>
        client.request('adminCreateLogisticsAccount', {
          body,
          headers: { 'Idempotency-Key': key },
          timeout: 30_000,
        })
      )
      if (!outcome) return
      if (outcome.ok) {
        close()
        toast.success(t('admin.logistics.create.done'))
        router.reload({ only: ['accounts'] })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      if (outcome.problem.errors?.length) {
        report.failed(formApi, applyServerErrors(formApi, outcome.problem, KNOWN))
      } else {
        setProblem(outcome.problem)
      }
    },
  })

  function close() {
    form.reset()
    intentKey.reset()
    report.clear()
    setProblem(null)
    setOffline(false)
    setOpen(false)
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true)
        else if (!mutation.pending) close()
      }}
    >
      <DialogTrigger asChild>
        <Button>{t('admin.logistics.add_platform')}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('admin.logistics.create.title')}</DialogTitle>
          <DialogDescription>{t('admin.logistics.create.description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <ErrorSummary form={form} summary={report.summary} summaryRef={report.summaryRef} />
          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) =>
                value.trim().length < accountName.min || value.trim().length > accountName.max
                  ? t('admin.logistics.create.name_rule', accountName)
                  : undefined,
            }}
          >
            {(field) => (
              <TextField
                id="account-name"
                label={t('admin.logistics.create.name')}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field name="environment">
            {(field) => (
              <ChoiceField
                id="account-environment"
                label={t('admin.logistics.create.environment')}
                value={field.state.value}
                options={[
                  { value: 'production', label: t('admin.logistics.environment.production') },
                  { value: 'sandbox', label: t('admin.logistics.environment.sandbox') },
                ]}
                errors={field.state.meta.errors}
                onChange={(value) => field.handleChange(value)}
              />
            )}
          </form.Field>
          <form.Field name="external_account_ref">
            {(field) => (
              <TextField
                id="account-reference"
                label={t('admin.logistics.create.reference')}
                description={t('admin.logistics.create.reference_help')}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <form.Field
            name="credentials.token"
            validators={{
              onBlur: ({ value }) =>
                value.length < token.min || value.length > token.max || !token.pattern.test(value)
                  ? t('admin.logistics.create.token_rule', { min: token.min, max: token.max })
                  : undefined,
            }}
          >
            {(field) => (
              <TextField
                id="account-token"
                type="password"
                autoComplete="off"
                label={t('admin.logistics.create.token')}
                description={t('admin.logistics.create.token_help')}
                value={field.state.value}
                errors={field.state.meta.errors}
                onChange={(value) => changeAndRecheck(field, value)}
                onBlur={field.handleBlur}
              />
            )}
          </form.Field>
          <ProblemAlert problem={problem} offline={offline} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => !mutation.pending && close()}>
              {t('common.form.cancel')}
            </Button>
            {/* Not disabled while pending, so it keeps focus; a second press is ignored (08 §7.1). */}
            <Button type="submit" aria-disabled={mutation.pending || undefined}>
              {mutation.pending
                ? t('admin.logistics.create.submitting')
                : t('admin.logistics.create.submit')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
