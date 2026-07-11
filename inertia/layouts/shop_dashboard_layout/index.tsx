import type { ReactNode } from 'react'
import { DashboardProvider, useDashboard } from './components/dashboard_context'
import { Sidebar } from './components/sidebar'
import { MobileNav } from './components/mobile_nav'
import { Navbar } from './components/navbar'
import { Breadcrumbs } from './components/breadcrumbs'
import { Footer } from './components/footer'
import { cn } from '~/lib/utils'

function ShopDashboardShell({ children }: { children: ReactNode }) {
  const { sidebarCollapsed } = useDashboard()

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <MobileNav />
      <div
        className={cn(
          'flex flex-1 flex-col transition-all duration-200',
          sidebarCollapsed ? 'lg:ml-16' : 'lg:ml-60'
        )}
      >
        <Navbar />
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
            <Breadcrumbs />
            {children}
          </div>
        </main>
        <Footer />
      </div>
    </div>
  )
}

export function ShopDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <DashboardProvider>
      <ShopDashboardShell>{children}</ShopDashboardShell>
    </DashboardProvider>
  )
}
