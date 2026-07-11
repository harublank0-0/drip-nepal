/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'shops.shop_registrations.create': {
    methods: ["GET","HEAD"]
    pattern: '/shops/register'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/auth/shop_registrations_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/auth/shop_registrations_controller').default['create']>>>
    }
  }
  'shops.shop_registrations.store': {
    methods: ["POST"]
    pattern: '/shops/register'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/shop').shopSignupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/shop').shopSignupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/auth/shop_registrations_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/auth/shop_registrations_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'shops.dashboard.shop_dashboard.create': {
    methods: ["GET","HEAD"]
    pattern: '/shops/dashboard'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_dashboard_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_dashboard_controller').default['create']>>>
    }
  }
  'shop_settings.overview': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/overview'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['overview']>>>
    }
  }
  'shop_settings.general': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/general'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['general']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['general']>>>
    }
  }
  'shop_settings.branding': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/branding'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['branding']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['branding']>>>
    }
  }
  'shop_settings.business_hours': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/business-hours'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['businessHours']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['businessHours']>>>
    }
  }
  'shop_settings.shipping': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/shipping'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['shipping']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['shipping']>>>
    }
  }
  'shop_settings.payments': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/payments'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['payments']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['payments']>>>
    }
  }
  'shop_settings.notifications': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/notifications'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['notifications']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['notifications']>>>
    }
  }
  'shop_settings.seo': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/seo'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['seo']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['seo']>>>
    }
  }
  'shop_settings.policies': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/policies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['policies']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['policies']>>>
    }
  }
  'shop_settings.social': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/social'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['social']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['social']>>>
    }
  }
  'shop_settings.analytics': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/analytics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['analytics']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['analytics']>>>
    }
  }
  'shop_settings.security': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/security'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['security']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['security']>>>
    }
  }
  'shop_settings.danger': {
    methods: ["GET","HEAD"]
    pattern: '/vendor/shop/danger'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['danger']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/shops/dashboard/shop_settings_controller').default['danger']>>>
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
      response: unknown
      errorResponse: unknown
    }
  }
  'new_account.create': {
    methods: ["GET","HEAD"]
    pattern: '/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['create']>>>
    }
  }
  'new_account.store': {
    methods: ["POST"]
    pattern: '/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/user').signupValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/user').signupValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/new_account_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'session.create': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['create']>>>
    }
  }
  'session.store': {
    methods: ["POST"]
    pattern: '/login'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/auth/user').loginValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/auth/user').loginValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
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
      response: unknown
      errorResponse: unknown
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
      response: unknown
      errorResponse: unknown
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
      response: unknown
      errorResponse: unknown
    }
  }
  'men_product_detail': {
    methods: ["GET","HEAD"]
    pattern: '/:attributeValue/:productSlug'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { attributeValue: ParamValue; productSlug: ParamValue }
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'cart': {
    methods: ["GET","HEAD"]
    pattern: '/cart'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'checkout': {
    methods: ["GET","HEAD"]
    pattern: '/checkout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
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
  'session.destroy': {
    methods: ["POST"]
    pattern: '/logout'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/session_controller').default['destroy']>>>
    }
  }
}
