import { useCallback, useEffect, useRef, useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import { addRecentSearch } from '~/lib/recent_searches'
import type { ListingFilters } from './types'

type MultiFilter = 'sizes' | 'colors'
type ListingProps = { filters?: ListingFilters; context?: { query?: string } }
type ListingState = { url: string; path: string; filters: ListingFilters; query: string }
type PendingRequest = { id: number; url: string; cancel?: () => void }

const DEBOUNCE_MS = 300

function validQuery(query: string) {
  return query.length === 0 || (query.length >= 2 && query.length <= 100)
}

/* Values are encoded, while comma-separated prototype filters stay readable. */
function listingUrl(path: string, filters: ListingFilters, extra: { q?: string; page?: number }) {
  const params: [string, string][] = []
  if (extra.q) params.push(['q', extra.q])
  if (filters.category) params.push(['category', filters.category])
  if (filters.sizes.length > 0) params.push(['size', filters.sizes.toSorted().join(',')])
  if (filters.colors.length > 0) params.push(['color', filters.colors.toSorted().join(',')])
  if (filters.min !== null) params.push(['min', String(filters.min)])
  if (filters.max !== null) params.push(['max', String(filters.max)])
  if (filters.sort !== 'newest') params.push(['sort', filters.sort])
  if (extra.page && extra.page > 1) params.push(['page', String(extra.page)])

  if (params.length === 0) return path
  const query = params
    .map(([key, value]) => `${key}=${encodeURIComponent(value).replaceAll('%2C', ',')}`)
    .join('&')
  return `${path}?${query}`
}

/*
 * The URL owns applied filters. The input has a draft, and transient refs merge
 * changes made before the previous visit finishes without copying server data
 * into React state. Every in-page visit replaces history and preserves scroll.
 */
export function useListingFilters(filters: ListingFilters, searchQuery?: string) {
  const { url } = usePage()
  const [query, setQueryState] = useState(searchQuery ?? '')
  const [isUpdating, setIsUpdating] = useState(false)
  const committed = useRef<ListingState>({
    url,
    path: url.split('?')[0],
    filters,
    query: searchQuery ?? '',
  })
  const desiredFilters = useRef(filters)
  const desiredQuery = useRef(searchQuery ?? '')
  const draft = useRef(searchQuery ?? '')
  const draftRevision = useRef(0)
  const composing = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestId = useRef(0)
  const pending = useRef<PendingRequest | null>(null)
  const startingOwnVisit = useRef(false)

  const cancelDebounce = useCallback(() => {
    if (debounce.current !== null) clearTimeout(debounce.current)
    debounce.current = null
  }, [])

  const cancelRequest = useCallback(() => {
    const cancel = pending.current?.cancel
    requestId.current += 1
    pending.current = null
    cancel?.()
    setIsUpdating(false)
  }, [])

  const cancelPending = useCallback(() => {
    cancelDebounce()
    cancelRequest()
    desiredFilters.current = committed.current.filters
    desiredQuery.current = committed.current.query
  }, [cancelDebounce, cancelRequest])

  /* The term a change applies: the draft when it can be searched, else the last one asked for. */
  const currentTerm = useCallback(() => {
    const term = draft.current.trim()
    return !composing.current && validQuery(term) ? term : desiredQuery.current
  }, [])

  /*
   * Recent searches are remembered when the customer is done with the
   * field (Enter, blur, leaving the page), not on every debounce commit,
   * so typing one word does not fill the list with its prefixes.
   */
  const rememberQuery = useCallback(() => {
    const term = currentTerm()
    if (term) addRecentSearch(term)
  }, [currentTerm])

  const restorePage = useCallback(
    (nextUrl: string, props: ListingProps) => {
      cancelPending()
      if (!props.filters) return
      const nextQuery = props.context?.query ?? ''
      committed.current = {
        url: nextUrl,
        path: nextUrl.split('?')[0],
        filters: props.filters,
        query: nextQuery,
      }
      desiredFilters.current = props.filters
      desiredQuery.current = nextQuery
      draft.current = nextQuery
      draftRevision.current += 1
      composing.current = false
      setQueryState(nextQuery)
    },
    [cancelPending]
  )

  useEffect(() => {
    // Replace visits do not emit navigate. Success also covers external reloads.
    const removeBefore = router.on('before', () => {
      if (startingOwnVisit.current) return
      rememberQuery()
      cancelPending()
    })
    const removeNavigate = router.on('navigate', ({ detail }) => {
      restorePage(detail.page.url, detail.page.props as ListingProps)
    })
    const removeSuccess = router.on('success', ({ detail }) => {
      if (!pending.current) restorePage(detail.page.url, detail.page.props as ListingProps)
    })
    // Stop the timer before Inertia asynchronously restores browser history.
    window.addEventListener('popstate', cancelPending)
    return () => {
      removeBefore()
      removeNavigate()
      removeSuccess()
      window.removeEventListener('popstate', cancelPending)
      cancelDebounce()
      requestId.current += 1
      pending.current?.cancel?.()
      pending.current = null
    }
  }, [cancelDebounce, cancelPending, rememberQuery, restorePage])

  const request = useCallback(
    (nextFilters: ListingFilters, nextQuery: string) => {
      cancelDebounce()
      const nextUrl = listingUrl(committed.current.path, nextFilters, { q: nextQuery })
      if (pending.current?.url === nextUrl) return

      const wasPending = pending.current !== null
      cancelRequest()
      desiredFilters.current = nextFilters
      desiredQuery.current = nextQuery
      if (!wasPending && nextUrl === committed.current.url) return

      const id = requestId.current
      const revision = draftRevision.current
      const submittedDraft = !composing.current && draft.current.trim() === nextQuery
      let succeeded = false
      pending.current = { id, url: nextUrl }
      startingOwnVisit.current = true
      try {
        router.get(
          nextUrl,
          {},
          {
            preserveState: true,
            preserveScroll: true,
            replace: true,
            only: ['context', 'products', 'facets', 'filters'],
            onCancelToken: ({ cancel }) => {
              if (pending.current?.id === id) pending.current.cancel = cancel
            },
            onStart: () => {
              if (requestId.current === id) setIsUpdating(true)
            },
            onSuccess: (page) => {
              if (requestId.current !== id) return
              succeeded = true
              const props = page.props as ListingProps
              const appliedFilters = props.filters ?? nextFilters
              const appliedQuery = props.context?.query ?? nextQuery
              committed.current = {
                url: page.url,
                path: page.url.split('?')[0],
                filters: appliedFilters,
                query: appliedQuery,
              }
              desiredFilters.current = appliedFilters
              desiredQuery.current = appliedQuery
              // A response for an earlier draft must not replace newer typing.
              if (submittedDraft && draftRevision.current === revision) {
                draft.current = appliedQuery
                setQueryState(appliedQuery)
              }
            },
            onFinish: () => {
              if (requestId.current !== id) return
              if (!succeeded) {
                desiredFilters.current = committed.current.filters
                desiredQuery.current = committed.current.query
              }
              pending.current = null
              setIsUpdating(false)
            },
          }
        )
      } finally {
        startingOwnVisit.current = false
      }
    },
    [cancelDebounce, cancelRequest]
  )

  const scheduleQuery = useCallback(() => {
    cancelDebounce()
    if (composing.current || !validQuery(draft.current.trim())) return
    debounce.current = setTimeout(() => {
      request(desiredFilters.current, draft.current.trim())
    }, DEBOUNCE_MS)
  }, [cancelDebounce, request])

  const setQuery = (value: string) => {
    draft.current = value
    draftRevision.current += 1
    setQueryState(value)
    scheduleQuery()
  }

  const setComposing = (value: boolean) => {
    composing.current = value
    if (value) cancelDebounce()
    else scheduleQuery()
  }

  const submitQuery = () => {
    cancelDebounce()
    const term = draft.current.trim()
    if (composing.current || !validQuery(term)) return
    rememberQuery()
    request(desiredFilters.current, term)
  }

  const clearQuery = () => {
    draft.current = ''
    draftRevision.current += 1
    composing.current = false
    setQueryState('')
    request(desiredFilters.current, '')
  }

  const update = (patch: Partial<ListingFilters>) => {
    request({ ...desiredFilters.current, ...patch }, currentTerm())
  }

  const toggle = (filter: MultiFilter, slug: string) => {
    const current = desiredFilters.current[filter]
    const next = current.includes(slug)
      ? current.filter((value) => value !== slug)
      : [...current, slug]
    update(filter === 'sizes' ? { sizes: next } : { colors: next })
  }

  const remove = (filter: MultiFilter, slug: string) => {
    const next = desiredFilters.current[filter].filter((value) => value !== slug)
    update(filter === 'sizes' ? { sizes: next } : { colors: next })
  }

  const setPrice = (min: number | null, max: number | null) => update({ min, max })

  const clear = () => update({ category: null, sizes: [], colors: [], min: null, max: null })
  const pageUrl = (page: number) =>
    listingUrl(committed.current.path, desiredFilters.current, { q: currentTerm(), page })

  const activeCount =
    (filters.category ? 1 : 0) +
    filters.sizes.length +
    filters.colors.length +
    (filters.min !== null || filters.max !== null ? 1 : 0)

  return {
    query,
    setQuery,
    submitQuery,
    clearQuery,
    rememberQuery,
    setComposing,
    update,
    toggle,
    remove,
    setPrice,
    clear,
    pageUrl,
    activeCount,
    isUpdating,
  }
}
