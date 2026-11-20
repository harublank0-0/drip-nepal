import { ThemeProvider } from '~/components/providers/theme_provider'

export function ThemeSection({
  title,
  theme,
  children,
}: {
  title: string
  theme: 'light' | 'dark'
  children: React.ReactNode
}) {
  return (
    <ThemeProvider defaultTheme={theme}>
      <section className={theme}>
        <div className="bg-background text-foreground rounded-lg border p-6">
          <h2 className="mb-6 text-2xl font-bold">{title}</h2>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">{children}</div>
        </div>
      </section>
    </ThemeProvider>
  )
}
