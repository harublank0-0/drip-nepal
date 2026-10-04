import { useCallback, useMemo, useState } from 'react'
import type { z } from 'zod'

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
