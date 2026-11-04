const BASE = 'http://return.invalid'

/*
 * The path to send someone back to after logging in, or null when the
 * value isn't a path on this site. Browsers read `//host`, `/\host` and
 * `/<tab>/host` as another host, so a value is kept only when it starts
 * with a single `/`, holds no backslash or control character, and a URL
 * parser resolves it to this site. API paths are refused: they aren't
 * pages. The fragment is dropped.
 */
export function safeReturnPath(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null
  // eslint-disable-next-line no-control-regex -- control characters are what this refuses
  if (/[\\\u0000-\u001F\u007F]/.test(value)) return null

  let url: URL
  try {
    url = new URL(value, BASE)
  } catch {
    return null
  }
  if (url.origin !== BASE || url.pathname.startsWith('/api/')) return null
  return `${url.pathname}${url.search}`
}
