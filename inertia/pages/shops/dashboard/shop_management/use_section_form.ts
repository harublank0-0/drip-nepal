import { useCallback, useMemo, useState } from 'react'
import type { z } from 'zod'

/**
 * Lightweight controlled-form helper shared by every settings section.
 *
 * Sections stay simple (`useState`-free at the call site): pass the current
 * slice of the draft plus the setter for that slice, get back typed field
 * errors (via Zod), touched tracking, and a `setField` updater that
 * immediately reports changes to the parent so the sticky save bar can pick
 * them up.
 */
export function useSectionForm<T extends Record<string, unknown>>(
  value: T,
  onChange: (next: T) => void,
  schema: z.ZodType<T>
) {
  const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({})

  const errors = useMemo(() => {
    const result = schema.safeParse(value)
    if (result.success) return {} as Partial<Record<keyof T, string>>

    const map: Partial<Record<keyof T, string>> = {}
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof T
      if (key !== undefined && !map[key]) map[key] = issue.message
    }
    return map
  }, [value, schema])

  const setField = useCallback(
    <K extends keyof T>(key: K, fieldValue: T[K]) => {
      onChange({ ...value, [key]: fieldValue })
    },
    [value, onChange]
  )

  const handleBlur = useCallback((key: keyof T) => {
    setTouched((prev) => ({ ...prev, [key]: true }))
  }, [])

  const isInvalid = useCallback(
    (key: keyof T) => !!touched[key] && !!errors[key],
    [touched, errors]
  )

  return { errors, setField, handleBlur, isInvalid, touched }
}
