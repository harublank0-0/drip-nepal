/* eslint-disable prettier/prettier */
import type { AdonisEndpoint } from '@tuyau/core/types'
import type { Registry } from './schema.d.ts'
import type { ApiDefinition } from './tree.d.ts'

const placeholder: any = {}

const routes = {
  'drive.fs.serve': {
    methods: ["GET","HEAD"],
    pattern: '/uploads/*',
    tokens: [{"old":"/uploads/*","type":0,"val":"uploads","end":""},{"old":"/uploads/*","type":2,"val":"*","end":""}],
    types: placeholder as Registry['drive.fs.serve']['types'],
  },
  'home': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['home']['types'],
  },
  'men': {
    methods: ["GET","HEAD"],
    pattern: '/men',
    tokens: [{"old":"/men","type":0,"val":"men","end":""}],
    types: placeholder as Registry['men']['types'],
  },
  'women': {
    methods: ["GET","HEAD"],
    pattern: '/women',
    tokens: [{"old":"/women","type":0,"val":"women","end":""}],
    types: placeholder as Registry['women']['types'],
  },
  'categories.show': {
    methods: ["GET","HEAD"],
    pattern: '/categories/:slug',
    tokens: [{"old":"/categories/:slug","type":0,"val":"categories","end":""},{"old":"/categories/:slug","type":1,"val":"slug","end":""}],
    types: placeholder as Registry['categories.show']['types'],
  },
  'search': {
    methods: ["GET","HEAD"],
    pattern: '/search',
    tokens: [{"old":"/search","type":0,"val":"search","end":""}],
    types: placeholder as Registry['search']['types'],
  },
  'stores.show': {
    methods: ["GET","HEAD"],
    pattern: '/stores/:slug',
    tokens: [{"old":"/stores/:slug","type":0,"val":"stores","end":""},{"old":"/stores/:slug","type":1,"val":"slug","end":""}],
    types: placeholder as Registry['stores.show']['types'],
  },
  'products.show': {
    methods: ["GET","HEAD"],
    pattern: '/products/:slug',
    tokens: [{"old":"/products/:slug","type":0,"val":"products","end":""},{"old":"/products/:slug","type":1,"val":"slug","end":""}],
    types: placeholder as Registry['products.show']['types'],
  },
  'api.search.suggestions': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/search/suggestions',
    tokens: [{"old":"/api/v1/search/suggestions","type":0,"val":"api","end":""},{"old":"/api/v1/search/suggestions","type":0,"val":"v1","end":""},{"old":"/api/v1/search/suggestions","type":0,"val":"search","end":""},{"old":"/api/v1/search/suggestions","type":0,"val":"suggestions","end":""}],
    types: placeholder as Registry['api.search.suggestions']['types'],
  },
  'legal.returns': {
    methods: ["GET","HEAD"],
    pattern: '/returns',
    tokens: [{"old":"/returns","type":0,"val":"returns","end":""}],
    types: placeholder as Registry['legal.returns']['types'],
  },
  'legal.terms': {
    methods: ["GET","HEAD"],
    pattern: '/terms',
    tokens: [{"old":"/terms","type":0,"val":"terms","end":""}],
    types: placeholder as Registry['legal.terms']['types'],
  },
  'legal.privacy': {
    methods: ["GET","HEAD"],
    pattern: '/privacy',
    tokens: [{"old":"/privacy","type":0,"val":"privacy","end":""}],
    types: placeholder as Registry['legal.privacy']['types'],
  },
  'ui.auth.user_registration.create': {
    methods: ["GET","HEAD"],
    pattern: '/auth/signup',
    tokens: [{"old":"/auth/signup","type":0,"val":"auth","end":""},{"old":"/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['ui.auth.user_registration.create']['types'],
  },
  'ui.auth.user_session.create': {
    methods: ["GET","HEAD"],
    pattern: '/auth/login',
    tokens: [{"old":"/auth/login","type":0,"val":"auth","end":""},{"old":"/auth/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['ui.auth.user_session.create']['types'],
  },
  'api.auth.user_registration.store': {
    methods: ["POST"],
    pattern: '/api/v1/signup',
    tokens: [{"old":"/api/v1/signup","type":0,"val":"api","end":""},{"old":"/api/v1/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['api.auth.user_registration.store']['types'],
  },
  'api.auth.user_session.store': {
    methods: ["POST"],
    pattern: '/api/v1/login',
    tokens: [{"old":"/api/v1/login","type":0,"val":"api","end":""},{"old":"/api/v1/login","type":0,"val":"v1","end":""},{"old":"/api/v1/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['api.auth.user_session.store']['types'],
  },
  'api.auth.logout': {
    methods: ["POST"],
    pattern: '/api/v1/logout',
    tokens: [{"old":"/api/v1/logout","type":0,"val":"api","end":""},{"old":"/api/v1/logout","type":0,"val":"v1","end":""},{"old":"/api/v1/logout","type":0,"val":"logout","end":""}],
    types: placeholder as Registry['api.auth.logout']['types'],
  },
  'ui.auth.shop.shop_registration.create': {
    methods: ["GET","HEAD"],
    pattern: '/auth/shop/register',
    tokens: [{"old":"/auth/shop/register","type":0,"val":"auth","end":""},{"old":"/auth/shop/register","type":0,"val":"shop","end":""},{"old":"/auth/shop/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['ui.auth.shop.shop_registration.create']['types'],
  },
  'api.auth.shop.shop_registration.store': {
    methods: ["POST"],
    pattern: '/api/v1/shop/register',
    tokens: [{"old":"/api/v1/shop/register","type":0,"val":"api","end":""},{"old":"/api/v1/shop/register","type":0,"val":"v1","end":""},{"old":"/api/v1/shop/register","type":0,"val":"shop","end":""},{"old":"/api/v1/shop/register","type":0,"val":"register","end":""}],
    types: placeholder as Registry['api.auth.shop.shop_registration.store']['types'],
  },
  'ui.shops.shop_dashboard.create': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/dashboard',
    tokens: [{"old":"/shops/:shopSlug/dashboard","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/dashboard","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/dashboard","type":0,"val":"dashboard","end":""}],
    types: placeholder as Registry['ui.shops.shop_dashboard.create']['types'],
  },
  'ui.shops.shop_products.index': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/products',
    tokens: [{"old":"/shops/:shopSlug/products","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/products","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/products","type":0,"val":"products","end":""}],
    types: placeholder as Registry['ui.shops.shop_products.index']['types'],
  },
  'ui.shops.shop_products.create': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/products/create',
    tokens: [{"old":"/shops/:shopSlug/products/create","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/products/create","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/products/create","type":0,"val":"products","end":""},{"old":"/shops/:shopSlug/products/create","type":0,"val":"create","end":""}],
    types: placeholder as Registry['ui.shops.shop_products.create']['types'],
  },
  'ui.shops.shop_products.edit': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/products/:id/edit',
    tokens: [{"old":"/shops/:shopSlug/products/:id/edit","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/products/:id/edit","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/products/:id/edit","type":0,"val":"products","end":""},{"old":"/shops/:shopSlug/products/:id/edit","type":1,"val":"id","end":""},{"old":"/shops/:shopSlug/products/:id/edit","type":0,"val":"edit","end":""}],
    types: placeholder as Registry['ui.shops.shop_products.edit']['types'],
  },
  'ui.shops.shop_orders.index': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/orders',
    tokens: [{"old":"/shops/:shopSlug/orders","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/orders","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/orders","type":0,"val":"orders","end":""}],
    types: placeholder as Registry['ui.shops.shop_orders.index']['types'],
  },
  'ui.shops.shop_orders.show': {
    methods: ["GET","HEAD"],
    pattern: '/shops/:shopSlug/orders/:orderNumber',
    tokens: [{"old":"/shops/:shopSlug/orders/:orderNumber","type":0,"val":"shops","end":""},{"old":"/shops/:shopSlug/orders/:orderNumber","type":1,"val":"shopSlug","end":""},{"old":"/shops/:shopSlug/orders/:orderNumber","type":0,"val":"orders","end":""},{"old":"/shops/:shopSlug/orders/:orderNumber","type":1,"val":"orderNumber","end":""}],
    types: placeholder as Registry['ui.shops.shop_orders.show']['types'],
  },
  'api.shops.shop_products.store': {
    methods: ["POST"],
    pattern: '/api/v1/shops/:shopSlug/products',
    tokens: [{"old":"/api/v1/shops/:shopSlug/products","type":0,"val":"api","end":""},{"old":"/api/v1/shops/:shopSlug/products","type":0,"val":"v1","end":""},{"old":"/api/v1/shops/:shopSlug/products","type":0,"val":"shops","end":""},{"old":"/api/v1/shops/:shopSlug/products","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/shops/:shopSlug/products","type":0,"val":"products","end":""}],
    types: placeholder as Registry['api.shops.shop_products.store']['types'],
  },
  'api.shops.shop_products.update': {
    methods: ["POST"],
    pattern: '/api/v1/shops/:shopSlug/products/:id',
    tokens: [{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"api","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"shops","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"products","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api.shops.shop_products.update']['types'],
  },
  'api.shops.shop_products.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/shops/:shopSlug/products/:id',
    tokens: [{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"api","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"shops","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":0,"val":"products","end":""},{"old":"/api/v1/shops/:shopSlug/products/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api.shops.shop_products.destroy']['types'],
  },
  'api.shops.shop_orders.update_status': {
    methods: ["POST"],
    pattern: '/api/v1/shops/:shopSlug/orders/:orderNumber/status',
    tokens: [{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":0,"val":"api","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":0,"val":"v1","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":0,"val":"shops","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":0,"val":"orders","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":1,"val":"orderNumber","end":""},{"old":"/api/v1/shops/:shopSlug/orders/:orderNumber/status","type":0,"val":"status","end":""}],
    types: placeholder as Registry['api.shops.shop_orders.update_status']['types'],
  },
  'cart.show': {
    methods: ["GET","HEAD"],
    pattern: '/cart',
    tokens: [{"old":"/cart","type":0,"val":"cart","end":""}],
    types: placeholder as Registry['cart.show']['types'],
  },
  'checkout.show': {
    methods: ["GET","HEAD"],
    pattern: '/checkout',
    tokens: [{"old":"/checkout","type":0,"val":"checkout","end":""}],
    types: placeholder as Registry['checkout.show']['types'],
  },
  'checkout.success': {
    methods: ["GET","HEAD"],
    pattern: '/checkout/success/:checkoutId',
    tokens: [{"old":"/checkout/success/:checkoutId","type":0,"val":"checkout","end":""},{"old":"/checkout/success/:checkoutId","type":0,"val":"success","end":""},{"old":"/checkout/success/:checkoutId","type":1,"val":"checkoutId","end":""}],
    types: placeholder as Registry['checkout.success']['types'],
  },
  'api.cart.items.store': {
    methods: ["POST"],
    pattern: '/api/v1/cart/items',
    tokens: [{"old":"/api/v1/cart/items","type":0,"val":"api","end":""},{"old":"/api/v1/cart/items","type":0,"val":"v1","end":""},{"old":"/api/v1/cart/items","type":0,"val":"cart","end":""},{"old":"/api/v1/cart/items","type":0,"val":"items","end":""}],
    types: placeholder as Registry['api.cart.items.store']['types'],
  },
  'api.cart.items.update': {
    methods: ["POST"],
    pattern: '/api/v1/cart/items/:id',
    tokens: [{"old":"/api/v1/cart/items/:id","type":0,"val":"api","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"cart","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"items","end":""},{"old":"/api/v1/cart/items/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api.cart.items.update']['types'],
  },
  'api.cart.items.destroy': {
    methods: ["DELETE"],
    pattern: '/api/v1/cart/items/:id',
    tokens: [{"old":"/api/v1/cart/items/:id","type":0,"val":"api","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"v1","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"cart","end":""},{"old":"/api/v1/cart/items/:id","type":0,"val":"items","end":""},{"old":"/api/v1/cart/items/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['api.cart.items.destroy']['types'],
  },
  'api.checkout.store': {
    methods: ["POST"],
    pattern: '/api/v1/checkout',
    tokens: [{"old":"/api/v1/checkout","type":0,"val":"api","end":""},{"old":"/api/v1/checkout","type":0,"val":"v1","end":""},{"old":"/api/v1/checkout","type":0,"val":"checkout","end":""}],
    types: placeholder as Registry['api.checkout.store']['types'],
  },
  'orders.track': {
    methods: ["GET","HEAD"],
    pattern: '/track-order',
    tokens: [{"old":"/track-order","type":0,"val":"track-order","end":""}],
    types: placeholder as Registry['orders.track']['types'],
  },
  'orders.track.show': {
    methods: ["GET","HEAD"],
    pattern: '/track-order/:orderNumber',
    tokens: [{"old":"/track-order/:orderNumber","type":0,"val":"track-order","end":""},{"old":"/track-order/:orderNumber","type":1,"val":"orderNumber","end":""}],
    types: placeholder as Registry['orders.track.show']['types'],
  },
  'api.orders.track.lookup': {
    methods: ["POST"],
    pattern: '/api/v1/track-order',
    tokens: [{"old":"/api/v1/track-order","type":0,"val":"api","end":""},{"old":"/api/v1/track-order","type":0,"val":"v1","end":""},{"old":"/api/v1/track-order","type":0,"val":"track-order","end":""}],
    types: placeholder as Registry['api.orders.track.lookup']['types'],
  },
  'api.orders.track.cancel': {
    methods: ["POST"],
    pattern: '/api/v1/track-order/:orderNumber/cancel',
    tokens: [{"old":"/api/v1/track-order/:orderNumber/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/track-order/:orderNumber/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/track-order/:orderNumber/cancel","type":0,"val":"track-order","end":""},{"old":"/api/v1/track-order/:orderNumber/cancel","type":1,"val":"orderNumber","end":""},{"old":"/api/v1/track-order/:orderNumber/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['api.orders.track.cancel']['types'],
  },
  'account.orders.index': {
    methods: ["GET","HEAD"],
    pattern: '/account/orders',
    tokens: [{"old":"/account/orders","type":0,"val":"account","end":""},{"old":"/account/orders","type":0,"val":"orders","end":""}],
    types: placeholder as Registry['account.orders.index']['types'],
  },
  'account.orders.show': {
    methods: ["GET","HEAD"],
    pattern: '/account/orders/:orderNumber',
    tokens: [{"old":"/account/orders/:orderNumber","type":0,"val":"account","end":""},{"old":"/account/orders/:orderNumber","type":0,"val":"orders","end":""},{"old":"/account/orders/:orderNumber","type":1,"val":"orderNumber","end":""}],
    types: placeholder as Registry['account.orders.show']['types'],
  },
  'api.account.orders.cancel': {
    methods: ["POST"],
    pattern: '/api/v1/account/orders/:orderNumber/cancel',
    tokens: [{"old":"/api/v1/account/orders/:orderNumber/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/account/orders/:orderNumber/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/account/orders/:orderNumber/cancel","type":0,"val":"account","end":""},{"old":"/api/v1/account/orders/:orderNumber/cancel","type":0,"val":"orders","end":""},{"old":"/api/v1/account/orders/:orderNumber/cancel","type":1,"val":"orderNumber","end":""},{"old":"/api/v1/account/orders/:orderNumber/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['api.account.orders.cancel']['types'],
  },
  'admin.home': {
    methods: ["GET","HEAD"],
    pattern: '/admin',
    tokens: [{"old":"/admin","type":0,"val":"admin","end":""}],
    types: placeholder as Registry['admin.home']['types'],
  },
  'admin.shops.index': {
    methods: ["GET","HEAD"],
    pattern: '/admin/shops',
    tokens: [{"old":"/admin/shops","type":0,"val":"admin","end":""},{"old":"/admin/shops","type":0,"val":"shops","end":""}],
    types: placeholder as Registry['admin.shops.index']['types'],
  },
  'api.admin.shops.status': {
    methods: ["POST"],
    pattern: '/api/v1/admin/shops/:id/status',
    tokens: [{"old":"/api/v1/admin/shops/:id/status","type":0,"val":"api","end":""},{"old":"/api/v1/admin/shops/:id/status","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/shops/:id/status","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/shops/:id/status","type":0,"val":"shops","end":""},{"old":"/api/v1/admin/shops/:id/status","type":1,"val":"id","end":""},{"old":"/api/v1/admin/shops/:id/status","type":0,"val":"status","end":""}],
    types: placeholder as Registry['api.admin.shops.status']['types'],
  },
  'design-system': {
    methods: ["GET","HEAD"],
    pattern: '/design-system',
    tokens: [{"old":"/design-system","type":0,"val":"design-system","end":""}],
    types: placeholder as Registry['design-system']['types'],
  },
} as const satisfies Record<string, AdonisEndpoint>

export { routes }

export const registry = {
  routes,
  $tree: {} as ApiDefinition,
}

declare module '@tuyau/core/types' {
  export interface UserRegistry {
    routes: typeof routes
    $tree: ApiDefinition
  }
}
