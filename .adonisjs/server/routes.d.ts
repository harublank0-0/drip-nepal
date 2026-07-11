import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'shops.register.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shops.register.shop_registrations.store': { paramsTuple?: []; params?: {} }
    'shop.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.auth.registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.session.create': { paramsTuple?: []; params?: {} }
    'api.auth.registration.store': { paramsTuple?: []; params?: {} }
    'api.auth.session.store': { paramsTuple?: []; params?: {} }
    'api.auth.logout': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'shops.register.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shop.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.auth.registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'shops.register.shop_registrations.create': { paramsTuple?: []; params?: {} }
    'shop.shop_dashboard.create': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'ui.auth.registration.create': { paramsTuple?: []; params?: {} }
    'ui.auth.session.create': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'men': { paramsTuple?: []; params?: {} }
    'women': { paramsTuple?: []; params?: {} }
    'categories.show': { paramsTuple: [ParamValue]; params: {'slug': ParamValue} }
    'men_product_detail': { paramsTuple: [ParamValue,ParamValue]; params: {'attributeValue': ParamValue,'productSlug': ParamValue} }
    'cart': { paramsTuple?: []; params?: {} }
    'checkout': { paramsTuple?: []; params?: {} }
    'design-system': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'shops.register.shop_registrations.store': { paramsTuple?: []; params?: {} }
    'api.auth.registration.store': { paramsTuple?: []; params?: {} }
    'api.auth.session.store': { paramsTuple?: []; params?: {} }
    'api.auth.logout': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}