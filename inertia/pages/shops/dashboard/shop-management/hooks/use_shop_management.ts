import { useCallback, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { ShopManagementData } from '../types'
import type { AutoSaveStatus } from '../types'

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
