import { useEffect, useRef, useState } from 'react'
import { listingUrl, type ListingUrlState } from '@shared/ui/listing_url'
import { applyFilters } from '~/lib/query_url'

/*
 * The filters of a storefront listing as the controls show them (docs/08
 * §11.1; R1-S part 3d-i-b). The URL is the only filter state: `fromUrl`
 * comes from the page props, and a new URL (a visit's answer, a link, Back)
 * replaces what is shown. Between a change and its answer the controls
 * show the change at once, and the next change builds on it, so a click
 * made while a visit is in flight never undoes the one before (a new visit
 * cancels the one in flight). `pending` marks the results while a visit
 * runs (`aria-busy`, 08 §11.1).
 */
export function useListingFilters(
  path: string,
  fromUrl: ListingUrlState,
  onResults: (props: Record<string, unknown>) => void
) {
  const urlKey = listingUrl(path, fromUrl)
  const [current, setCurrent] = useState(fromUrl)
  const [seenKey, setSeenKey] = useState(urlKey)
  if (urlKey !== seenKey) {
    setSeenKey(urlKey)
    setCurrent(fromUrl)
  }
  const [pending, setPending] = useState(false)
  // What the next change builds on: the filters last asked for.
  const chosen = useRef(fromUrl)
  useEffect(() => {
    chosen.current = current
  }, [current])
  // The URL's filters, which a visit that fails puts back.
  const applied = useRef(fromUrl)
  useEffect(() => {
    applied.current = fromUrl
  })
  // The latest visit: one a newer visit cancelled does not touch what is shown.
  const latest = useRef(0)

  /*
   * `update` returns null when nothing changes, so no visit is made; the
   * result says whether one was. A visit that fails (a network error, an
   * error page) puts the URL's filters back on the controls.
   */
  function apply(update: (state: ListingUrlState) => ListingUrlState | null) {
    const changed = update(chosen.current)
    if (changed === null) return false
    const next = { ...changed, page: 1 }
    chosen.current = next
    setCurrent(next)
    const visit = ++latest.current
    let arrived = false
    applyFilters(path, next, {
      onStart: () => setPending(true),
      onSuccess: (props) => {
        arrived = true
        onResults(props)
      },
      onFinish: () => {
        if (visit !== latest.current) return
        setPending(false)
        if (!arrived) {
          chosen.current = applied.current
          setCurrent(applied.current)
        }
      },
    })
    return true
  }

  return { current, apply, pending }
}
