import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'search': { paramsTuple?: []; params?: {} }
    'stores.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'api.search.suggestions': { paramsTuple?: []; params?: {} }
    'ui.auth.user_registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.user_session.create': { paramsTuple?: []; params?: {} }
    'api.auth.user_registration.store': { paramsTuple?: []; params?: {} }
    'api.auth.user_session.store': { paramsTuple?: []; params?: {} }
    'api.auth.logout': { paramsTuple?: []; params?: {} }
    'ui.auth.shop.shop_registration.create': { paramsTuple?: []; params?: {} }
    'api.auth.shop.shop_registration.store': { paramsTuple?: []; params?: {} }
    'ui.shops.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'ui.shops.shop_orders.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_orders.show': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'orderNumber': ParamValue} }
    'api.shops.shop_products.store': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'api.shops.shop_products.update': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'api.shops.shop_products.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'api.shops.shop_orders.update_status': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'orderNumber': ParamValue} }
    'cart.show': { paramsTuple?: []; params?: {} }
    'checkout.show': { paramsTuple?: []; params?: {} }
    'checkout.success': { paramsTuple: [ParamValue]; params: {'checkoutId': ParamValue} }
    'account.orders.index': { paramsTuple?: []; params?: {} }
    'account.orders.show': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'api.cart.items.store': { paramsTuple?: []; params?: {} }
    'api.cart.items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'api.cart.items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'api.checkout.store': { paramsTuple?: []; params?: {} }
    'api.account.orders.cancel': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'admin.home': { paramsTuple?: []; params?: {} }
    'admin.shops.index': { paramsTuple?: []; params?: {} }
    'api.admin.shops.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'search': { paramsTuple?: []; params?: {} }
    'stores.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'api.search.suggestions': { paramsTuple?: []; params?: {} }
    'ui.auth.user_registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.user_session.create': { paramsTuple?: []; params?: {} }
    'ui.auth.shop.shop_registration.create': { paramsTuple?: []; params?: {} }
    'ui.shops.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'ui.shops.shop_orders.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_orders.show': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'orderNumber': ParamValue} }
    'cart.show': { paramsTuple?: []; params?: {} }
    'checkout.show': { paramsTuple?: []; params?: {} }
    'checkout.success': { paramsTuple: [ParamValue]; params: {'checkoutId': ParamValue} }
    'account.orders.index': { paramsTuple?: []; params?: {} }
    'account.orders.show': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'admin.home': { paramsTuple?: []; params?: {} }
    'admin.shops.index': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'search': { paramsTuple?: []; params?: {} }
    'stores.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'products.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'api.search.suggestions': { paramsTuple?: []; params?: {} }
    'ui.auth.user_registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.user_session.create': { paramsTuple?: []; params?: {} }
    'ui.auth.shop.shop_registration.create': { paramsTuple?: []; params?: {} }
    'ui.shops.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'ui.shops.shop_orders.index': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.shops.shop_orders.show': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'orderNumber': ParamValue} }
    'cart.show': { paramsTuple?: []; params?: {} }
    'checkout.show': { paramsTuple?: []; params?: {} }
    'checkout.success': { paramsTuple: [ParamValue]; params: {'checkoutId': ParamValue} }
    'account.orders.index': { paramsTuple?: []; params?: {} }
    'account.orders.show': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'admin.home': { paramsTuple?: []; params?: {} }
    'admin.shops.index': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'api.auth.user_registration.store': { paramsTuple?: []; params?: {} }
    'api.auth.user_session.store': { paramsTuple?: []; params?: {} }
    'api.auth.logout': { paramsTuple?: []; params?: {} }
    'api.auth.shop.shop_registration.store': { paramsTuple?: []; params?: {} }
    'api.shops.shop_products.store': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'api.shops.shop_products.update': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'api.shops.shop_orders.update_status': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'orderNumber': ParamValue} }
    'api.cart.items.store': { paramsTuple?: []; params?: {} }
    'api.cart.items.update': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'api.checkout.store': { paramsTuple?: []; params?: {} }
    'api.account.orders.cancel': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'api.admin.shops.status': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
  DELETE: {
    'api.shops.shop_products.destroy': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'id': ParamValue} }
    'api.cart.items.destroy': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}