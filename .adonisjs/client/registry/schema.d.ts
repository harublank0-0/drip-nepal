/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'drive.fs.serve': {
    methods: ["GET","HEAD"]
    pattern: '/uploads/*'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { '*': ParamValue[] }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'home': {
    methods: ["GET","HEAD"]
    pattern: '/'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['home']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['home']>>>
    }
  }
  'men': {
    methods: ["GET","HEAD"]
    pattern: '/men'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['men']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['men']>>>
    }
  }
  'women': {
    methods: ["GET","HEAD"]
    pattern: '/women'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['women']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['women']>>>
    }
  }
  'categories.show': {
    methods: ["GET","HEAD"]
    pattern: '/categories/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['category']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['category']>>>
    }
  }
  'search': {
    methods: ["GET","HEAD"]
    pattern: '/search'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['search']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['search']>>>
    }
  }
  'stores.show': {
    methods: ["GET","HEAD"]
    pattern: '/stores/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['store']>>>
    }
  }
  'products.show': {
    methods: ["GET","HEAD"]
    pattern: '/products/:slug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { slug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['product']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['product']>>>
    }
  }
  'api.search.suggestions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/search/suggestions'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['suggestions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/catalog/controllers/catalog_controller').default['suggestions']>>>
    }
  }
  'legal.returns': {
    methods: ["GET","HEAD"]
    pattern: '/returns'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'legal.terms': {
    methods: ["GET","HEAD"]
    pattern: '/terms'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'legal.privacy': {
    methods: ["GET","HEAD"]
    pattern: '/privacy'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'ui.auth.user_registration.create': {
    methods: ["GET","HEAD"]
    pattern: '/auth/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/controllers/registration_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/controllers/registration_controller').default['create']>>>
    }
  }
  'ui.auth.user_session.create': {
    methods: ["GET","HEAD"]
    pattern: '/auth/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['create']>>>
    }
  }
  'api.auth.user_registration.store': {
    methods: ["POST"]
    pattern: '/api/v1/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/auth/validators/user').userSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/auth/validators/user').userSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/controllers/registration_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/controllers/registration_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.auth.user_session.store': {
    methods: ["POST"]
    pattern: '/api/v1/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/auth/validators/user').userLoginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/auth/validators/user').userLoginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.auth.logout': {
    methods: ["POST"]
    pattern: '/api/v1/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/auth/controllers/session_controller').default['destroy']>>>
    }
  }
  'ui.auth.shop.shop_registration.create': {
    methods: ["GET","HEAD"]
    pattern: '/auth/shop/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_registrations_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_registrations_controller').default['create']>>>
    }
  }
  'api.auth.shop.shop_registration.store': {
    methods: ["POST"]
    pattern: '/api/v1/shop/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/shops/validators/shop').shopSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/shops/validators/shop').shopSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_registrations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_registrations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'ui.shops.shop_dashboard.create': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/dashboard'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_dashboard_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_dashboard_controller').default['create']>>>
    }
  }
  'ui.shops.shop_products.index': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/products'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['index']>>>
    }
  }
  'ui.shops.shop_products.create': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/products/create'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['create']>>>
    }
  }
  'ui.shops.shop_products.edit': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/products/:id/edit'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['edit']>>>
    }
  }
  'ui.shops.shop_orders.index': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/orders'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['index']>>>
    }
  }
  'ui.shops.shop_orders.show': {
    methods: ["GET","HEAD"]
    pattern: '/shops/:shopSlug/orders/:orderNumber'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; orderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['show']>>>
    }
  }
  'api.shops.shop_products.store': {
    methods: ["POST"]
    pattern: '/api/v1/shops/:shopSlug/products'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/shops/validators/product').productValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/shops/validators/product').productValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.shops.shop_products.update': {
    methods: ["POST"]
    pattern: '/api/v1/shops/:shopSlug/products/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/shops/validators/product').productValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/shops/validators/product').productValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.shops.shop_products.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/shops/:shopSlug/products/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_products_controller').default['destroy']>>>
    }
  }
  'api.shops.shop_orders.update_status': {
    methods: ["POST"]
    pattern: '/api/v1/shops/:shopSlug/orders/:orderNumber/status'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; orderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['updateStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/shops/controllers/shop_orders_controller').default['updateStatus']>>>
    }
  }
  'cart.show': {
    methods: ["GET","HEAD"]
    pattern: '/cart'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['show']>>>
    }
  }
  'checkout.show': {
    methods: ["GET","HEAD"]
    pattern: '/checkout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['show']>>>
    }
  }
  'checkout.success': {
    methods: ["GET","HEAD"]
    pattern: '/checkout/success/:checkoutId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { checkoutId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['success']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['success']>>>
    }
  }
  'account.orders.index': {
    methods: ["GET","HEAD"]
    pattern: '/account/orders'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['index']>>>
    }
  }
  'account.orders.show': {
    methods: ["GET","HEAD"]
    pattern: '/account/orders/:orderNumber'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['show']>>>
    }
  }
  'api.cart.items.store': {
    methods: ["POST"]
    pattern: '/api/v1/cart/items'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/orders/validators/cart').addToCartValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/orders/validators/cart').addToCartValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.cart.items.update': {
    methods: ["POST"]
    pattern: '/api/v1/cart/items/:id'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/orders/validators/cart').updateCartItemValidator)>>
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#modules/orders/validators/cart').updateCartItemValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.cart.items.destroy': {
    methods: ["DELETE"]
    pattern: '/api/v1/cart/items/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/cart_controller').default['destroy']>>>
    }
  }
  'api.checkout.store': {
    methods: ["POST"]
    pattern: '/api/v1/checkout'
    types: {
      body: ExtractBody<InferInput<(typeof import('#modules/orders/validators/checkout').checkoutValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#modules/orders/validators/checkout').checkoutValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/checkout_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'api.account.orders.cancel': {
    methods: ["POST"]
    pattern: '/api/v1/account/orders/:orderNumber/cancel'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { orderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/orders/controllers/account_orders_controller').default['cancel']>>>
    }
  }
  'admin.home': {
    methods: ["GET","HEAD"]
    pattern: '/admin'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'admin.shops.index': {
    methods: ["GET","HEAD"]
    pattern: '/admin/shops'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/admin/controllers/admin_shops_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/admin/controllers/admin_shops_controller').default['index']>>>
    }
  }
  'api.admin.shops.status': {
    methods: ["POST"]
    pattern: '/api/v1/admin/shops/:id/status'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#modules/admin/controllers/admin_shops_controller').default['updateStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#modules/admin/controllers/admin_shops_controller').default['updateStatus']>>>
    }
  }
  'design-system': {
    methods: ["GET","HEAD"]
    pattern: '/design-system'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
}
