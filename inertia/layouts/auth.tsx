import { Toaster } from 'sonner'
import { ThemeProvider } from '~/components/providers/theme_provider'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="dark">
      {children}
      <Toaster position="top-center" richColors />
    </ThemeProvider>
  )
}
