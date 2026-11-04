import { useState } from 'react'
import { router, usePage } from '@inertiajs/react'
import type { ListingFilters } from './types'

type MultiFilter = 'sizes' | 'colors'

/*
 * Builds a listing URL from the filters, e.g. `/men?size=m,l&sort=price_asc`.
 * Values are encoded but commas stay readable since the backend splits on them.
 */
function listingUrl(path: string, filters: ListingFilters, extra: { q?: string; page?: number }) {
  const params: [string, string][] = []
  if (extra.q) params.push(['q', extra.q])
  if (filters.sizes.length > 0) params.push(['size', filters.sizes.join(',')])
  if (filters.colors.length > 0) params.push(['color', filters.colors.join(',')])
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
 * Filters live in the URL. Every change is a GET visit to the current path
 * that keeps the search term, drops the page and preserves scroll and
 * local state (so the mobile filter sheet stays open).
 */
export function useListingFilters(filters: ListingFilters, searchQuery?: string) {
  const { url } = usePage()
  const path = url.split('?')[0]
  const [isUpdating, setIsUpdating] = useState(false)

  const update = (patch: Partial<ListingFilters>) => {
    router.get(
      listingUrl(path, { ...filters, ...patch }, { q: searchQuery }),
      {},
      {
        preserveState: true,
        preserveScroll: true,
        onStart: () => setIsUpdating(true),
        onFinish: () => setIsUpdating(false),
      }
    )
  }

  const toggle = (filter: MultiFilter, slug: string) => {
    const current = filters[filter]
    const next = current.includes(slug)
      ? current.filter((value) => value !== slug)
      : [...current, slug]
    update(filter === 'sizes' ? { sizes: next } : { colors: next })
  }

  const setPrice = (min: number | null, max: number | null) => update({ min, max })

  const clear = () => update({ sizes: [], colors: [], min: null, max: null })

  const pageUrl = (page: number) => listingUrl(path, filters, { q: searchQuery, page })

  const activeCount =
    filters.sizes.length +
    filters.colors.length +
    (filters.min !== null || filters.max !== null ? 1 : 0)

  return { update, toggle, setPrice, clear, pageUrl, activeCount, isUpdating }
}
