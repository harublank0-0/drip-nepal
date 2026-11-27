import {
  clearRecentSearches,
  readRecentSearches,
  rememberSearch,
  type TermStore,
} from '@shared/ui/recent_searches'

/*
 * The recent searches in this browser's `localStorage` (docs/08 §11.1;
 * shared/ui/recent_searches.ts holds the rules). Each call touches the
 * store only when it runs, never during the server render (docs/09 §13.8
 * rule 1), and a browser that blocks storage simply keeps no list.
 */
function store(): TermStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function recentSearches(): string[] {
  const local = store()
  return local ? readRecentSearches(local) : []
}

export function rememberRecentSearch(term: string) {
  const local = store()
  if (local) rememberSearch(local, term)
}

export function forgetRecentSearches() {
  const local = store()
  if (local) clearRecentSearches(local)
}
