import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'
import type { BreadcrumbItem } from './types'
import { useOrderAlerts, type OrderAlerts } from './use_order_alerts'

interface DashboardContextType {
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  toggleSidebar: () => void
  mobileNavOpen: boolean
  setMobileNavOpen: (open: boolean) => void
  breadcrumbs: BreadcrumbItem[]
  setBreadcrumbs: (items: BreadcrumbItem[]) => void
  orderAlerts: OrderAlerts
}

const DashboardContext = createContext<DashboardContextType | null>(null)

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([])
  const { currentShop } = usePage<Data.SharedProps>().props
  const orderAlerts = useOrderAlerts(currentShop?.slug)

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev)
  }, [])

  return (
    <DashboardContext.Provider
      value={{
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebar,
        mobileNavOpen,
        setMobileNavOpen,
        breadcrumbs,
        setBreadcrumbs,
        orderAlerts,
      }}
    >
      {children}
    </DashboardContext.Provider>
  )
}

export function useDashboard() {
  const context = useContext(DashboardContext)
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider')
  }
  return context
}
