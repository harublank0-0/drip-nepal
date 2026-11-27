import { SEARCH_TERM_MAX, SEARCH_TERM_MIN, searchedTerm } from './listing_url.js'

/*
 * The recent searches of the storefront's search modal (docs/08 §11.1; R1-S
 * part 3d-iii-b): this browser only, never sent to the server. At most five
 * terms, the latest first; a term the server would read as the same one
 * (`searchedTerm`, case ignored) replaces the older copy; a term the server
 * would refuse is never kept. The store is passed in, so the logic runs in
 * a unit test; in the browser it is `localStorage` (inertia/lib).
 */
export const RECENT_SEARCHES_KEY = 'dripnepal.recent_searches'
export const RECENT_SEARCHES_MAX = 5

export type TermStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function readRecentSearches(store: TermStore): string[] {
  try {
    const parsed: unknown = JSON.parse(store.getItem(RECENT_SEARCHES_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is string => typeof item === 'string')
      .slice(0, RECENT_SEARCHES_MAX)
  } catch {
    return []
  }
}

// The list with `term` first, or unchanged when the term would not be searched.
export function rememberSearch(store: TermStore, term: string): string[] {
  const searched = searchedTerm(term)
  const length = [...searched].length
  const current = readRecentSearches(store)
  if (length < SEARCH_TERM_MIN || length > SEARCH_TERM_MAX) return current
  const key = searched.toLocaleLowerCase()
  const next = [
    searched,
    ...current.filter((item) => searchedTerm(item).toLocaleLowerCase() !== key),
  ].slice(0, RECENT_SEARCHES_MAX)
  try {
    store.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next))
  } catch {
    // A full or blocked store: the list is a convenience, so nothing else happens.
  }
  return next
}

export function clearRecentSearches(store: TermStore) {
  try {
    store.removeItem(RECENT_SEARCHES_KEY)
  } catch {
    // As above.
  }
}
