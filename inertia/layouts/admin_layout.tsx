import type { ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ShieldCheckIcon } from 'lucide-react'
import type { Data } from '@generated/data'

/*
 * A plain shell for the platform admin pages.
 */
export function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = usePage<Data.SharedProps>().props

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-2 font-semibold">
            <ShieldCheckIcon className="size-5 text-primary" />
            Drip Nepal Admin
          </div>
          <nav className="flex items-center gap-4 text-sm text-muted-foreground">
            <Link href="/admin/shops" className="hover:text-foreground">
              Shops
            </Link>
            <Link route="home" className="hover:text-foreground">
              Storefront
            </Link>
            <span className="hidden sm:inline">{user?.email}</span>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
