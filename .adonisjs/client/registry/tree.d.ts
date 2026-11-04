/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  drive: {
    fs: {
      serve: typeof routes['drive.fs.serve']
    }
  }
  home: typeof routes['home']
  men: typeof routes['men']
  women: typeof routes['women']
  categories: {
    show: typeof routes['categories.show']
  }
  search: typeof routes['search']
  stores: {
    show: typeof routes['stores.show']
  }
  products: {
    show: typeof routes['products.show']
  }
  api: {
    search: {
      suggestions: typeof routes['api.search.suggestions']
    }
    auth: {
      userRegistration: {
        store: typeof routes['api.auth.user_registration.store']
      }
      userSession: {
        store: typeof routes['api.auth.user_session.store']
      }
      logout: typeof routes['api.auth.logout']
      shop: {
        shopRegistration: {
          store: typeof routes['api.auth.shop.shop_registration.store']
        }
      }
    }
    shops: {
      shopProducts: {
        store: typeof routes['api.shops.shop_products.store']
        update: typeof routes['api.shops.shop_products.update']
        destroy: typeof routes['api.shops.shop_products.destroy']
      }
      shopOrders: {
        updateStatus: typeof routes['api.shops.shop_orders.update_status']
      }
    }
    cart: {
      items: {
        store: typeof routes['api.cart.items.store']
        update: typeof routes['api.cart.items.update']
        destroy: typeof routes['api.cart.items.destroy']
      }
    }
    checkout: {
      store: typeof routes['api.checkout.store']
    }
    orders: {
      track: {
        lookup: typeof routes['api.orders.track.lookup']
        cancel: typeof routes['api.orders.track.cancel']
      }
    }
    account: {
      orders: {
        cancel: typeof routes['api.account.orders.cancel']
      }
    }
    admin: {
      shops: {
        status: typeof routes['api.admin.shops.status']
      }
    }
  }
  legal: {
    returns: typeof routes['legal.returns']
    terms: typeof routes['legal.terms']
    privacy: typeof routes['legal.privacy']
  }
  ui: {
    auth: {
      userRegistration: {
        create: typeof routes['ui.auth.user_registration.create']
      }
      userSession: {
        create: typeof routes['ui.auth.user_session.create']
      }
      shop: {
        shopRegistration: {
          create: typeof routes['ui.auth.shop.shop_registration.create']
        }
      }
    }
    shops: {
      shopDashboard: {
        create: typeof routes['ui.shops.shop_dashboard.create']
      }
      shopProducts: {
        index: typeof routes['ui.shops.shop_products.index']
        create: typeof routes['ui.shops.shop_products.create']
        edit: typeof routes['ui.shops.shop_products.edit']
      }
      shopOrders: {
        index: typeof routes['ui.shops.shop_orders.index']
        show: typeof routes['ui.shops.shop_orders.show']
      }
    }
  }
  cart: {
    show: typeof routes['cart.show']
  }
  checkout: {
    show: typeof routes['checkout.show']
    success: typeof routes['checkout.success']
  }
  orders: {
    track: typeof routes['orders.track'] & {
      show: typeof routes['orders.track.show']
    }
  }
  account: {
    orders: {
      index: typeof routes['account.orders.index']
      show: typeof routes['account.orders.show']
    }
  }
  admin: {
    home: typeof routes['admin.home']
    shops: {
      index: typeof routes['admin.shops.index']
    }
  }
  designSystem: typeof routes['design-system']
}
