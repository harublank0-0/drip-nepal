import { createContext, useContext, useEffect, useState } from 'react'
import { type Theme } from '@shared/ui/theme'
import { applyTheme, watchSystemTheme, writeThemeCookie } from '~/lib/theme'

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | null>(null)

/*
 * The theme of docs/08 §1.2. Its first value is the `theme` page prop, which
 * the server read from the `dn_theme` cookie and also used for the class on
 * <html>, so the server markup and the first client render agree and
 * nothing flips after JavaScript loads (RF-08). A change writes the cookie,
 * so the next page arrives in the chosen theme. Other open tabs take the new
 * theme on their next full page load: unlike the old localStorage `storage`
 * event, a cookie change notifies nobody.
 */
export function ThemeProvider({
  children,
  initialTheme,
}: {
  children: React.ReactNode
  initialTheme: Theme
}) {
  const [theme, setThemeState] = useState<Theme>(initialTheme)

  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    return watchSystemTheme(() => applyTheme('system'))
  }, [theme])

  const value = {
    theme,
    setTheme: (next: Theme) => {
      writeThemeCookie(next)
      setThemeState(next)
    },
  }

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)
  if (context === null) throw new Error('useTheme must be used within a ThemeProvider')
  return context
}
