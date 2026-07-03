import { useEffect } from 'react'
import { router } from '@inertiajs/react'

export default function ShopDashboardPage() {
  useEffect(() => {
    router.visit('/vendor/shop/overview', { replace: true })
  }, [])

  return null
}
