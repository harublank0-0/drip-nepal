import type { AnyFieldApi, AnyFormApi } from '@tanstack/react-form'
import type { Problem, ProblemItem } from '@shared/api/problem'
import { splitServerErrors } from '@shared/api/problem'
import { t } from '~/lib/i18n'

/*
 * Server errors into a TanStack form (docs/08 §7.1, docs/09 §13.5): each
 * known field's messages go into its `errorMap.onServer`, which the form
 * clears on the field's next change or blur; the rest is returned for the
 * error summary.
 */
export function messageFor(item: ProblemItem) {
  const key = `errors.field.${item.code}` as Parameters<typeof t>[0]
  const text = t(key)
  return text === key ? item.message : text
}

export function applyServerErrors(form: AnyFormApi, problem: Problem, known: ReadonlySet<string>) {
  const { fields, formLevel } = splitServerErrors(problem, known, messageFor)
  for (const [path, messages] of fields) {
    form.setFieldMeta(path, (prev) => ({
      ...prev,
      errorMap: { ...prev.errorMap, onServer: messages.join(' ') },
    }))
  }
  return formLevel
}

/*
 * A field's change handler (docs/08 §7.1): once the field shows a blur error,
 * it is checked again as the user types, so a fixed value clears its message
 * before the next click. A message that only cleared on blur would vanish as
 * the pointer presses the submit button, move the button, and swallow the
 * click. No message appears while the user types the first time.
 */
export function changeAndRecheck(field: AnyFieldApi, value: unknown) {
  field.handleChange(value)
  if (field.state.meta.errorMap.onBlur) void field.validate('blur')
}

/*
 * A submit button while its request runs: `aria-disabled`, not `disabled`, so it
 * keeps focus (08 §7.1), dimmed like a disabled one; the `ui/button` copy styles
 * only `disabled`.
 */
export const PENDING_BUTTON = 'aria-disabled:cursor-progress aria-disabled:opacity-50'
