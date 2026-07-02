import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'shops.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shops.shop_registrations.store': { paramsTuple?: []; params?: {} }
    'shops.shop_dashboard.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'shops.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shops.shop_dashboard.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'shops.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shops.shop_dashboard.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'new_account.create': { paramsTuple?: []; params?: {} }
    'session.create': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'shops.shop_registrations.store': { paramsTuple?: []; params?: {} }
    'new_account.store': { paramsTuple?: []; params?: {} }
    'session.store': { paramsTuple?: []; params?: {} }
    'session.destroy': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}