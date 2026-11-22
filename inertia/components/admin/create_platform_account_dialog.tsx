import { useState } from 'react'
import { useForm } from '@tanstack/react-form'
import { router } from '@inertiajs/react'
import { toast } from 'sonner'
import type { Route } from '@tuyau/core/types'
import type { Problem } from '@shared/api/problem'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { useIntentKey } from '~/hooks/use_intent_key'
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
} from '~/components/ui/dialog'
import { TextField } from '~/components/forms/text_field'
import { ChoiceField } from '~/components/forms/choice_field'
import { ErrorSummary } from '~/components/forms/error_summary'
import { ProblemAlert } from '~/components/forms/problem_alert'

/*
 * Create DripNepal's own Nepal Can Move account (`adminCreateLogisticsAccount`
 * ⚷, step-up; docs/06 §13.8, OD-58). The key is made when the intent starts
 * and kept across retries of the same values (docs/08 §7.3 rule 4). The token
 * is sent once, stored encrypted and never shown again; the account stays
 * `pending` until NCM answers its test call.
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

const KNOWN = new Set(['name', 'environment', 'external_account_ref', 'credentials.token'])

const PRINTABLE = /^[\x21-\x7e]+$/

export function CreatePlatformAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const mutation = useApiMutation()
  const intentKey = useIntentKey<Body>()
  const [summary, setSummary] = useState<string[]>([])
  const [problem, setProblem] = useState<Problem | null>(null)
  const [offline, setOffline] = useState(false)

  const form = useForm({
    defaultValues: EMPTY,
    // Submit re-runs every validator on the current values, so an error the user has just
    // fixed (a blur or server message still in state) never blocks the submit.
    canSubmitWhenInvalid: true,
    onSubmit: async ({ value, formApi }) => {
      setSummary([])
      setProblem(null)
      setOffline(false)
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
        intentKey.reset()
        formApi.reset()
        onOpenChange(false)
        toast.success(t('admin.logistics.create.done'))
        router.reload({ only: ['accounts'] })
        return
      }
      if ('offline' in outcome) {
        setOffline(true)
        return
      }
      if (outcome.problem.errors?.length) {
        setSummary(applyServerErrors(formApi, outcome.problem, KNOWN))
      } else {
        setProblem(outcome.problem)
      }
    },
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <ErrorSummary messages={summary} />
          <form.Field
            name="name"
            validators={{
              onBlur: ({ value }) =>
                value.trim().length < 2 || value.trim().length > 80
                  ? t('admin.logistics.create.name_rule')
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
                value.length < 8 || value.length > 200 || !PRINTABLE.test(value)
                  ? t('admin.logistics.create.token_rule')
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
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.form.cancel')}
            </Button>
            <Button type="submit" disabled={mutation.pending}>
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
