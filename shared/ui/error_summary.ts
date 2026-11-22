/*
 * What a form shows after a failed submit (docs/08 §7.1 "Error summary"):
 * the fields' current messages in the form's order, then the form-level
 * ones. One field error on a short form moves focus straight to that field;
 * anything else shows the summary and focuses it. Pure, so the rule is
 * tested without a browser (T-UI-005).
 */
export type SummaryField = { name: string; id: string }
export type SummaryItem = { message: string; target: string | null }

type ErrorMap = Record<string, unknown> | undefined

/** Each field's messages from its TanStack `errorMap`, once each, in the form's order. */
export function fieldErrorItems(
  fields: readonly SummaryField[],
  errorMapOf: (name: string) => ErrorMap
): SummaryItem[] {
  return fields.flatMap(({ name, id }) => {
    const messages = new Set(
      Object.values(errorMapOf(name) ?? {}).filter(
        (value): value is string => typeof value === 'string' && value !== ''
      )
    )
    return [...messages].map((message) => ({ message, target: id }))
  })
}

export type AfterFailure = { summary: boolean; focus: string | null }

export const SUMMARY_TARGET = 'summary'

export function afterFailedSubmit(fieldItems: SummaryItem[], formLevel: string[]): AfterFailure {
  const count = fieldItems.length + formLevel.length
  if (count === 0) return { summary: false, focus: null }
  if (count === 1 && fieldItems.length === 1) return { summary: false, focus: fieldItems[0].target }
  return { summary: true, focus: SUMMARY_TARGET }
}
