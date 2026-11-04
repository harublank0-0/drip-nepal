import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react'
import { isBrowser } from '~/lib/utils'

type Theme = 'dark' | 'light' | 'system'

type ThemeProviderProps = {
  children: React.ReactNode
  defaultTheme?: Theme
  storageKey?: string
}

type ThemeProviderState = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

const initialState: ThemeProviderState = {
  theme: 'system',
  setTheme: () => null,
}

const ThemeProviderContext = createContext<ThemeProviderState>(initialState)

function subscribeToStorage(onChange: () => void) {
  window.addEventListener('storage', onChange)
  return () => window.removeEventListener('storage', onChange)
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  storageKey = 'drip-ui-theme',
  ...props
}: ThemeProviderProps) {
  // The server has no saved theme, so hydration renders the default; React
  // then switches to the saved one without a mismatch (useSyncExternalStore
  // uses getServerSnapshot while hydrating).
  const savedTheme = useSyncExternalStore(
    subscribeToStorage,
    () => localStorage.getItem(storageKey) as Theme | null,
    () => null
  )
  const [chosenTheme, setTheme] = useState<Theme | null>(null)
  const theme = chosenTheme ?? savedTheme ?? defaultTheme

  useEffect(() => {
    if (!isBrowser) return

    const root = window.document.documentElement

    root.classList.remove('light', 'dark')

    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

      root.classList.add(systemTheme)
      return
    }

    root.classList.add(theme)
  }, [theme])

  const value = {
    theme,
    setTheme: (themeValue: Theme) => {
      localStorage.setItem(storageKey, themeValue)
      setTheme(themeValue)
    },
  }

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext)

  if (context === undefined) throw new Error('useTheme must be used within a ThemeProvider')

  return context
}
