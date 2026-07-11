/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  shops: {
    shopRegistrations: {
      create: typeof routes['shops.shop_registrations.create']
      store: typeof routes['shops.shop_registrations.store']
    }
    dashboard: {
      shopDashboard: {
        create: typeof routes['shops.dashboard.shop_dashboard.create']
      }
    }
  }
  shopDashboard: {
    create: typeof routes['shop_dashboard.create']
  }
  shopSettings: {
    overview: typeof routes['shop_settings.overview']
    general: typeof routes['shop_settings.general']
    branding: typeof routes['shop_settings.branding']
    businessHours: typeof routes['shop_settings.business_hours']
    shipping: typeof routes['shop_settings.shipping']
    payments: typeof routes['shop_settings.payments']
    notifications: typeof routes['shop_settings.notifications']
    seo: typeof routes['shop_settings.seo']
    policies: typeof routes['shop_settings.policies']
    social: typeof routes['shop_settings.social']
    analytics: typeof routes['shop_settings.analytics']
    security: typeof routes['shop_settings.security']
    danger: typeof routes['shop_settings.danger']
  }
  home: typeof routes['home']
  newAccount: {
    create: typeof routes['new_account.create']
    store: typeof routes['new_account.store']
  }
  session: {
    create: typeof routes['session.create']
    store: typeof routes['session.store']
    destroy: typeof routes['session.destroy']
  }
  men: typeof routes['men']
  women: typeof routes['women']
  categories: {
    show: typeof routes['categories.show']
  }
  menProductDetail: typeof routes['men_product_detail']
  cart: typeof routes['cart']
  checkout: typeof routes['checkout']
  designSystem: typeof routes['design-system']
}
