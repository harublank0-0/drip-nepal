import { type ReactNode } from 'react'
import { Link } from '@adonisjs/inertia/react'

type SplitLayoutProps = {
  left: ReactNode
  right: ReactNode
}

/*
 * Branding beside the form on large screens. On phones the form comes
 * first, under a slim bar with the logo that leads back to the shop.
 */
export function SplitLayout({ left, right }: SplitLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-[45%] items-center justify-center">{left}</div>
      <div className="flex w-full flex-col lg:w-[55%]">
        <header className="flex items-center justify-between border-b border-border/50 px-5 py-4 lg:hidden">
          <Link route="home" aria-label="Drip Nepal home">
            <span className="text-2xl font-bold uppercase tracking-tight">
              <span className="text-white">drip</span>
              <span className="text-primary">nepal</span>
            </span>
          </Link>
          <Link
            route="home"
            className="text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Back to shop
          </Link>
        </header>
        <div className="flex flex-1 items-start justify-center lg:items-center">{right}</div>
      </div>
    </div>
  )
}
