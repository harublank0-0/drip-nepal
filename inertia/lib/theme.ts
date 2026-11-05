export type Theme = 'light' | 'dark' | 'system'

const THEME_CHANGE = 'dn-theme-change'

export function readTheme(): Theme | null {
  const value = /(?:^|;\s*)dn_theme=([^;]*)(?:;|$)/.exec(document.cookie)?.[1]
  return value === 'light' || value === 'dark' || value === 'system' ? value : null
}

export function setTheme(theme: Theme) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `dn_theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`
  window.dispatchEvent(new Event(THEME_CHANGE))
}

export function subscribeToTheme(onChange: () => void) {
  window.addEventListener(THEME_CHANGE, onChange)
  // Cookies are shared across tabs; refresh the preference when returning.
  window.addEventListener('focus', onChange)
  window.addEventListener('pageshow', onChange)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    window.removeEventListener(THEME_CHANGE, onChange)
    window.removeEventListener('focus', onChange)
    window.removeEventListener('pageshow', onChange)
    document.removeEventListener('visibilitychange', onChange)
  }
}
