import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ShopManagementData } from './types'
import type { AutoSaveStatus } from './components/shared/auto_save_indicator'

/**
 * Central state manager for the Shop Management page.
 *
 * Holds a `saved` baseline (last confirmed persisted state) and a `draft`
 * (what's currently rendered in the form). Any difference between the two
 * drives the "unsaved changes" badge and the sticky save bar. Saving is
 * simulated with a network delay to demonstrate optimistic UI + auto-save
 * patterns; swapping in real API calls only requires updating `persist`.
 */
export function useShopManagement(initialData: ShopManagementData) {
  const [saved, setSaved] = useState(initialData)
  const [draft, setDraft] = useState(initialData)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>('idle')

  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved])

  const setSection = useCallback(
    <K extends keyof ShopManagementData>(
      key: K,
      updater: ShopManagementData[K] | ((prev: ShopManagementData[K]) => ShopManagementData[K])
    ) => {
      setDraft((prev) => ({
        ...prev,
        [key]: typeof updater === 'function' ? (updater as any)(prev[key]) : updater,
      }))
    },
    []
  )

  const discard = useCallback(() => {
    setDraft(saved)
    toast.info('Changes discarded')
  }, [saved])

  const persist = useCallback(async (next: ShopManagementData) => {
    // Simulated network latency. Replace with a real request (e.g. via
    // Inertia's router.put) once backend endpoints exist for these fields.
    await new Promise((resolve) => setTimeout(resolve, 850))
    return next
  }, [])

  const save = useCallback(async () => {
    setIsSaving(true)
    setSaveStatus('saving')
    try {
      const result = await persist(draft)
      setSaved(result)
      setSaveStatus('saved')
      toast.success('Shop settings saved')
      window.setTimeout(() => setSaveStatus('idle'), 2500)
      return true
    } catch {
      setSaveStatus('error')
      toast.error('Something went wrong while saving. Please try again.')
      return false
    } finally {
      setIsSaving(false)
    }
  }, [draft, persist])

  return {
    draft,
    saved,
    isDirty,
    isSaving,
    saveStatus,
    setSection,
    discard,
    save,
  }
}

export type UseShopManagementReturn = ReturnType<typeof useShopManagement>
