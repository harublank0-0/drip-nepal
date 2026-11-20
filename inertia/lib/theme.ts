import { THEME_COLORS, THEME_COOKIE, type Theme } from '@shared/ui/theme'

/*
 * The browser half of the theme (docs/08 §1.2, docs/09 §13.10). The server
 * already wrote the class on <html> from the cookie, or, for `system`, the
 * inline script in the root view did, so these run only in effects and
 * event handlers, never during render (docs/09 §13.8 rule 1).
 */

const DARK_QUERY = '(prefers-color-scheme: dark)'

// One year; not HttpOnly, because this code writes it; Secure on HTTPS.
export function writeThemeCookie(theme: Theme) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${THEME_COOKIE}=${theme}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`
}

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia(DARK_QUERY).matches)
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  // The theme-color tags the root view wrote: under `system`, a tag with a
  // colour-scheme media query keeps its own colour; otherwise every tag takes
  // the colour of the theme now shown.
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const scheme = /dark/.test(meta.media) ? 'dark' : /light/.test(meta.media) ? 'light' : null
    meta.content = THEME_COLORS[theme === 'system' && scheme ? scheme : dark ? 'dark' : 'light']
  }
}

// Follows the operating system while the choice is `system`.
export function watchSystemTheme(onChange: () => void) {
  const query = window.matchMedia(DARK_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}
