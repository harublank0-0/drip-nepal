const BASE = 'http://return.invalid'

// Longer than any page path of the site; a longer one would end on a 414 or 431, not a page.
export const MAX_RETURN_PATH_LENGTH = 2048

/*
 * The one return-path helper of docs/07 TM-14: the page to send someone
 * back to after signing in, or null when the value isn't a path on this
 * site (the caller answers `/` then). `logIn` checks its `return_to` with
 * it (docs/06 §13.3), and so will `verifyMfaChallenge`; identity's
 * `queries.ts` re-exports it for the controllers (docs/09 §2.1).
 *
 * Browsers read `//host`, `/\host` and `/<tab>/host` as another host, so a
 * value is kept only when it starts with a single `/`, holds no backslash
 * or control character, and a URL parser resolves it to a path on this
 * site that doesn't itself start with `//`. The answer is that resolved
 * path and query, never a value whose dot segments resolve to `//host`
 * (`/..//host`, `/.//host`): those are refused, not passed on. API paths
 * are refused: they aren't pages, and so is a value longer than
 * `MAX_RETURN_PATH_LENGTH`, which `logIn` would otherwise echo and the
 * browser visit. The fragment is dropped.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > MAX_RETURN_PATH_LENGTH) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex -- control characters are what this refuses
  if (/[\\\u0000-\u001F\u007F]/.test(value)) return null

  let url: URL
  try {
    url = new URL(value, BASE)
  } catch {
    return null
  }
  // Dot segments can still resolve to `//host`: `/..//host` is `//host`.
  if (url.origin !== BASE || url.pathname.startsWith('//') || url.pathname.startsWith('/api/')) {
    return null
  }
  return `${url.pathname}${url.search}`
}
