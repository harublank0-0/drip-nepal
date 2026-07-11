/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  shops: {
    register: {
      shopRegistrations: {
        create: typeof routes['shops.register.shop_registrations.create']
        store: typeof routes['shops.register.shop_registrations.store']
      }
    }
  }
  shop: {
    shopDashboard: {
      create: typeof routes['shop.shop_dashboard.create']
    }
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
