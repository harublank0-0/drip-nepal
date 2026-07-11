import { createContext, useContext, useState, type ReactNode } from 'react'
import { useShopManagement } from './hooks/use-shop-management'
import type { UseShopManagementReturn } from './hooks/use-shop-management'
import { createMockShopData } from './mock-data'

export type ShopManagementContextType = UseShopManagementReturn

const ShopManagementContext = createContext<ShopManagementContextType | null>(null)

export function ShopManagementProvider({ children }: { children: ReactNode }) {
  const [data] = useState(createMockShopData)
  const management = useShopManagement(data)

  return (
    <ShopManagementContext.Provider value={management}>{children}</ShopManagementContext.Provider>
  )
}

export function useShopManagementContext(): ShopManagementContextType {
  const context = useContext(ShopManagementContext)
  if (!context) {
    throw new Error('useShopManagementContext must be used within ShopManagementProvider')
  }
  return context
}
