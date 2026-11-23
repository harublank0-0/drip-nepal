import { useEffect, useState } from 'react'
import { client } from '~/client'
import { apiCall } from '~/lib/api'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'

/*
 * The location cascade of the address forms (docs/08 §4.3; 01
 * AC-FR-IAM-012-1, -2): Province → District → Local level → Ward, each
 * list read from the reference data when the step before it is chosen
 * (`listDistricts`, `listLocalLevels`, docs/06 §13.2), so only places of
 * the data can be chosen, never free text (VX-10 [Verify-external]: offered
 * as choices, never described as official). The customer's `AddressForm`
 * (M1 part 6b) and the shop's `PickupAddressForm` (R1-S part 1c) share it.
 */
export type Place = { code: string; name: string }
export type LocalLevel = Place & { ward_count: number }

// The cascade's lists: read once per parent code, from the reference data.
export async function districtsOf(province: string): Promise<Place[] | null> {
  const outcome = await apiCall(() =>
    client.request('listDistricts', { query: { province }, timeout: 30_000 })
  )
  return outcome.ok ? outcome.data.data : null
}

export async function localLevelsOf(district: string): Promise<LocalLevel[] | null> {
  const outcome = await apiCall(() =>
    client.request('listLocalLevels', { query: { district }, timeout: 30_000 })
  )
  return outcome.ok ? outcome.data.data : null
}

export type ListState<P> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; items: P[] }

/*
 * One step of the cascade: the list for `parent`, read when `parent` is
 * first chosen and kept for the life of the form. "Try again" forgets a
 * failure, so the effect reads it again. A late answer for a parent no
 * longer chosen is dropped.
 */
export function useCascade<P>(parent: string, read: (parent: string) => Promise<P[] | null>) {
  const [lists, setLists] = useState<Record<string, P[] | 'failed'>>({})
  const entry = parent === '' ? undefined : lists[parent]
  useEffect(() => {
    if (parent === '' || entry !== undefined) return
    let live = true
    void read(parent).then((items) => {
      if (live) setLists((previous) => ({ ...previous, [parent]: items ?? 'failed' }))
    })
    return () => {
      live = false
    }
  }, [parent, entry, read])

  let state: ListState<P> = { status: 'idle' }
  if (parent !== '') {
    if (entry === undefined) state = { status: 'loading' }
    else if (entry === 'failed') state = { status: 'failed' }
    else state = { status: 'ready', items: entry }
  }
  function retry() {
    setLists((previous) => {
      const next = { ...previous }
      delete next[parent]
      return next
    })
  }
  return { state, retry }
}

// The saved place stays choosable on edit even when the reference data has made it inactive.
export function withSaved<P extends Place>(items: P[], saved: P | null): P[] {
  if (!saved || items.some((item) => item.code === saved.code)) return items
  return [...items, saved]
}

export function placeholderFor(state: ListState<unknown>, waiting: string, choose: string) {
  if (state.status === 'idle') return waiting
  if (state.status === 'loading') return t('common.location.loading')
  return choose
}

// A list of the cascade that could not be read, with a way to read it again.
export function LoadFailed({ state, onRetry }: { state: ListState<unknown>; onRetry: () => void }) {
  if (state.status !== 'failed') return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
      <span>{t('common.location.load_failed')}</span>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        {t('common.location.retry')}
      </Button>
    </div>
  )
}
