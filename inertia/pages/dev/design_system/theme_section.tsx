/*
 * One theme's swatches. The section's own class scopes the theme, because
 * Tailwind's `dark` variant matches any `.dark` ancestor; the page's theme
 * on <html> stays as the dn_theme cookie set it (docs/08 §1.2).
 */
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
    <section className={theme}>
      <div className="bg-background text-foreground rounded-lg border p-6">
        <h2 className="mb-6 text-2xl font-bold">{title}</h2>

        {/* One column on phones, so a wide card cannot push the page sideways. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {children}
        </div>
      </div>
    </section>
  )
}
