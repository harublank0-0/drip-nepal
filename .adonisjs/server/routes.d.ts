import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
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
    'api.auth.registration.store': { paramsTuple?: []; params?: {} }
    'api.auth.session.store': { paramsTuple?: []; params?: {} }
    'api.auth.logout': { paramsTuple?: []; params?: {} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}