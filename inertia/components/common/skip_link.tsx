import type { ReactNode } from 'react'
import { cn } from '~/lib/utils'

/*
 * A skip link (docs/08 §9.1): the first Tab stop of a page, hidden until it
 * has focus, then shown at the top left. "Skip to main content" targets the
 * layout's `<main id="main" tabindex="-1">`; dashboards add "Skip to
 * navigation".
 */
export const SKIP_LINK =
  'sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:ring-2 focus:ring-ring'

export function SkipLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <a href={href} className={cn(SKIP_LINK, className)}>
      {children}
    </a>
  )
}
