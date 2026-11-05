import { createContext, useContext, useEffect, useMemo, useSyncExternalStore } from 'react'
import { readTheme, setTheme, subscribeToTheme, type Theme } from '~/lib/theme'

export type { Theme } from '~/lib/theme'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  initialTheme?: Theme
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined)

export function ThemeProvider({
  children,
  defaultTheme = 'light',
  initialTheme = defaultTheme,
}: ThemeProviderProps) {
  // Hydration uses the same prop as SSR; later renders read the cookie.
  const theme = useSyncExternalStore(
    subscribeToTheme,
    () => readTheme() ?? defaultTheme,
    () => initialTheme
  )

  useEffect(() => {
    // The head script may have migrated an older preference since SSR.
    // Wait for the current snapshot instead of briefly applying stale props.
    if (theme !== (readTheme() ?? defaultTheme)) return

    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      root.classList.remove('light', 'dark')
      root.classList.add(resolved)
    }

    apply()
    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme, defaultTheme])

  const value = useMemo(() => ({ theme, setTheme }), [theme])

  return <ThemeProviderContext.Provider value={value}>{children}</ThemeProviderContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
