const STORAGE_KEY = 'drip:recent-searches'
const LIMIT = 5

/*
 * Recent search terms, kept only in this browser's localStorage.
 */
export function readRecentSearches(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(stored)
      ? stored.filter((item): item is string => typeof item === 'string').slice(0, LIMIT)
      : []
  } catch {
    return []
  }
}

function write(items: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Storage can be full or disabled (private mode); recent searches are optional.
  }
  return items
}

export function addRecentSearch(term: string) {
  const value = term.trim()
  if (!value) return readRecentSearches()
  const rest = readRecentSearches().filter((item) => item.toLowerCase() !== value.toLowerCase())
  return write([value, ...rest].slice(0, LIMIT))
}

export function removeRecentSearch(term: string) {
  return write(readRecentSearches().filter((item) => item !== term))
}

export function clearRecentSearches() {
  return write([])
}
