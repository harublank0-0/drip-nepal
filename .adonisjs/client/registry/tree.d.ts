/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  ui: {
    auth: {
      registration: {
        create: typeof routes['ui.auth.registration.create']
      }
      session: {
        create: typeof routes['ui.auth.session.create']
      }
    }
  }
  api: {
    auth: {
      registration: {
        store: typeof routes['api.auth.registration.store']
      }
      session: {
        store: typeof routes['api.auth.session.store']
      }
      logout: typeof routes['api.auth.logout']
    }
  }
  home: typeof routes['home']
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
