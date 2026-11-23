import { useEffect, type RefObject } from 'react'
import { t } from '~/lib/i18n'
import type { StepUp } from '~/hooks/use_step_up'

type StepUpView = StepUp['view']
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { ProblemAlert } from '~/components/forms/problem_alert'
import { TotpField } from '~/components/forms/totp_field'

/*
 * The TOTP field a dialog swaps in when its action needs step-up (docs/08
 * §7.3 rule 5, `useStepUp`): what is asked and why, one code input with
 * `autocomplete="one-time-code"` (SC 3.3.8), and what `verifyMfaChallenge`
 * answered. The field takes focus when it appears (§9.1); the dialog's
 * values stay as they were. Renders nothing until the action asks.
 */
export function StepUpField({
  view,
  fieldRef,
  id,
}: {
  view: StepUpView
  fieldRef: RefObject<HTMLInputElement | null>
  id: string
}) {
  if (!view.needed) return null
  return (
    <div className="space-y-3">
      <Alert role="status">
        <AlertTitle>{t('common.step_up.title')}</AlertTitle>
        <AlertDescription>{t('common.step_up.body')}</AlertDescription>
      </Alert>
      <FocusOnMount target={fieldRef} />
      <TotpField
        ref={fieldRef}
        id={id}
        label={t('common.step_up.code')}
        description={t('common.step_up.code_help')}
        value={view.code}
        onChange={view.setCode}
        errors={view.error ? [view.error] : []}
      />
      <ProblemAlert problem={view.problem} offline={view.offline} />
    </div>
  )
}

// Moves focus to the field once, when the step-up part appears.
function FocusOnMount({ target }: { target: RefObject<HTMLInputElement | null> }) {
  useEffect(() => {
    target.current?.focus()
  }, [target])
  return null
}
