import type { RefObject } from 'react'
import { useStore, type AnyFormApi } from '@tanstack/react-form'
import { fieldErrorItems } from '@shared/ui/error_summary'
import type { SummaryState } from '~/hooks/use_error_report'
import { t } from '~/lib/i18n'

/*
 * The error summary of docs/08 §7.1, above the first field: a heading with
 * the count, then one entry per error, linked to its field. It lists the
 * fields' current messages, so an entry goes once its field is fixed, and
 * the summary goes when none is left; form-level messages stay until the
 * next submit. `useErrorReport` decides when it shows and focuses it.
 */
export function ErrorSummary({
  form,
  summary,
  summaryRef,
}: {
  form: AnyFormApi
  summary: SummaryState
  summaryRef: RefObject<HTMLDivElement | null>
}) {
  const fieldMeta = useStore(form.store, (state) => state.fieldMeta)
  if (!summary.shown) return null
  const items = [
    ...fieldErrorItems(summary.fields, (name) => fieldMeta[name]?.errorMap),
    ...summary.formLevel.map((message) => ({ message, target: null })),
  ]
  if (items.length === 0) return null
  return (
    <div
      ref={summaryRef}
      tabIndex={-1}
      role="alert"
      className="border-destructive space-y-1 rounded-md border p-3 text-sm outline-none"
    >
      <p className="font-medium">{t('common.form.error_summary', { count: items.length })}</p>
      <ul className="ml-4 list-disc">
        {items.map((item, index) => (
          // Two entries may share a message; the list is rebuilt on every change.
          <li key={`${item.target ?? 'form'}-${index}`}>
            {item.target ? (
              <a
                href={`#${item.target}`}
                className="text-link underline underline-offset-4"
                onClick={(event) => {
                  event.preventDefault()
                  document.getElementById(item.target!)?.focus()
                }}
              >
                {item.message}
              </a>
            ) : (
              item.message
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
