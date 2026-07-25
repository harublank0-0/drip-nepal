/* eslint-disable prettier/prettier */
/// <reference path="../manifest.d.ts" />

import type { ExtractBody, ExtractErrorResponse, ExtractQuery, ExtractQueryForGet, ExtractResponse } from '@tuyau/core/types'
import type { InferInput, SimpleError } from '@vinejs/vine/types'

export type ParamValue = string | number | bigint | boolean

export interface Registry {
  'ui.auth.registration.create': {
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
  'ui.auth.session.create': {
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
  'api.auth.registration.store': {
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
  'api.auth.session.store': {
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
}
