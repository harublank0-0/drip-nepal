import { useEffect, useRef, useState } from 'react'
import type { AnyFormApi } from '@tanstack/react-form'
import {
  afterFailedSubmit,
  fieldErrorItems,
  SUMMARY_TARGET,
  type SummaryField,
} from '@shared/ui/error_summary'

/*
 * The report of a failed submit (docs/08 §7.1): call `failed(formApi, formLevel)`
 * from `onSubmitInvalid` or after a 422, and `clear()` when a new submit
 * starts or the form closes. One field error moves focus to that field;
 * anything else shows `ErrorSummary` and focuses it
 * (shared/ui/error_summary.ts). Focus moves once per failure, not while the
 * user fixes the fields.
 */
export function useErrorReport(fields: readonly SummaryField[]) {
  const [attempt, setAttempt] = useState(0)
  const [formLevel, setFormLevel] = useState<string[]>([])
  const [withSummary, setWithSummary] = useState(false)
  const [focusTarget, setFocusTarget] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusTarget) return
    if (focusTarget === SUMMARY_TARGET) summaryRef.current?.focus()
    else document.getElementById(focusTarget)?.focus()
  }, [attempt, focusTarget])

  function failed(form: AnyFormApi, level: string[] = []) {
    const items = fieldErrorItems(fields, (name) => form.getFieldMeta(name)?.errorMap)
    const next = afterFailedSubmit(items, level)
    setFormLevel(level)
    setWithSummary(next.summary)
    setFocusTarget(next.focus)
    setAttempt((count) => count + 1)
  }

  function clear() {
    setFormLevel([])
    setWithSummary(false)
    setFocusTarget(null)
  }

  // `summary` holds plain values for `ErrorSummary`; its box takes `summaryRef`.
  return { summary: { fields, formLevel, shown: withSummary }, summaryRef, failed, clear }
}

export type SummaryState = ReturnType<typeof useErrorReport>['summary']
