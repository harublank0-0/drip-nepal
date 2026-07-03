import type { HttpContext } from '@adonisjs/core/http'

export default class ShopSettingsController {
  async overview({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Overview/index', {})
  }

  async general({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/General/index', {})
  }

  async branding({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Branding/index', {})
  }

  async businessHours({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/BusinessHours/index', {})
  }

  async shipping({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Shipping/index', {})
  }

  async payments({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Payments/index', {})
  }

  async notifications({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Notifications/index', {})
  }

  async seo({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/SEO/index', {})
  }

  async policies({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Policies/index', {})
  }

  async social({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Social/index', {})
  }

  async analytics({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Analytics/index', {})
  }

  async security({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/Security/index', {})
  }

  async danger({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/shop-management/pages/DangerZone/index', {})
  }
}
