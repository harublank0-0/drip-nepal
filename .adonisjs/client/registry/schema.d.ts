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
  'signUp': {
    methods: ["POST"]
    pattern: '/api/v1/auth/signup'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/sign_up').signUpValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/sign_up').signUpValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['signUp']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['signUp']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'logIn': {
    methods: ["POST"]
    pattern: '/api/v1/auth/session'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/log_in').logInValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/log_in').logInValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['logIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['logIn']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'logOut': {
    methods: ["DELETE"]
    pattern: '/api/v1/auth/session'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['logOut']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['logOut']>>>
    }
  }
  'verifyMfaChallenge': {
    methods: ["POST"]
    pattern: '/api/v1/auth/mfa/challenge'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/mfa').verifyMfaChallengeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/mfa').verifyMfaChallengeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['verifyMfaChallenge']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['verifyMfaChallenge']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'resendEmailVerification': {
    methods: ["POST"]
    pattern: '/api/v1/auth/email-verification'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['resendEmailVerification']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['resendEmailVerification']>>>
    }
  }
  'confirmEmail': {
    methods: ["POST"]
    pattern: '/api/v1/auth/email-verification/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/confirm_email').confirmEmailValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/confirm_email').confirmEmailValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['confirmEmail']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/registration_controller').default['confirmEmail']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'requestPasswordReset': {
    methods: ["POST"]
    pattern: '/api/v1/auth/password-reset'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/request_password_reset').requestPasswordResetValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/request_password_reset').requestPasswordResetValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['requestPasswordReset']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['requestPasswordReset']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'resetPassword': {
    methods: ["POST"]
    pattern: '/api/v1/auth/password-reset/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/reset_password').resetPasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/reset_password').resetPasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['resetPassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['resetPassword']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'getMe': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/me'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['getMe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['getMe']>>>
    }
  }
  'updateMe': {
    methods: ["PATCH"]
    pattern: '/api/v1/me'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/update_me').updateMeValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/update_me').updateMeValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['updateMe']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['updateMe']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'requestAccountDeletion': {
    methods: ["POST"]
    pattern: '/api/v1/me/deletion-request'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/request_account_deletion').requestAccountDeletionValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/request_account_deletion').requestAccountDeletionValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['requestAccountDeletion']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/me_controller').default['requestAccountDeletion']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'changePassword': {
    methods: ["POST"]
    pattern: '/api/v1/me/password'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/change_password').changePasswordValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/change_password').changePasswordValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['changePassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/password_controller').default['changePassword']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'revokeAllSessions': {
    methods: ["POST"]
    pattern: '/api/v1/me/sessions/revoke-all'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['revokeAllSessions']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/session_controller').default['revokeAllSessions']>>>
    }
  }
  'startTotpEnrollment': {
    methods: ["POST"]
    pattern: '/api/v1/me/mfa/totp'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/mfa').startTotpEnrollmentValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/mfa').startTotpEnrollmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['startTotpEnrollment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['startTotpEnrollment']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'confirmTotpEnrollment': {
    methods: ["POST"]
    pattern: '/api/v1/me/mfa/totp/confirm'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/mfa').confirmTotpEnrollmentValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/mfa').confirmTotpEnrollmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['confirmTotpEnrollment']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/auth/identity/mfa_controller').default['confirmTotpEnrollment']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'listProvinces': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/locations/provinces'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listProvinces']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listProvinces']>>>
    }
  }
  'listDistricts': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/locations/districts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/logistics/locations').listDistrictsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listDistricts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listDistricts']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'listLocalLevels': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/locations/local-levels'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/logistics/locations').listLocalLevelsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listLocalLevels']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/logistics/locations_controller').default['listLocalLevels']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'listCategories': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/catalog/categories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listCategories']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listCategories']>>>
    }
  }
  'listAttributes': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/catalog/attributes'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: ExtractQueryForGet<InferInput<(typeof import('#validators/catalog/storefront').listAttributesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listAttributes']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listAttributes']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'listProducts': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/catalog/products'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listProducts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['listProducts']>>>
    }
  }
  'getProduct': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/catalog/products/:publicId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { publicId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['getProduct']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/public/catalog/catalog_controller').default['getProduct']>>>
    }
  }
  'listAddresses': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/me/addresses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['listAddresses']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['listAddresses']>>>
    }
  }
  'createAddress': {
    methods: ["POST"]
    pattern: '/api/v1/me/addresses'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/address').createAddressValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/address').createAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['createAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['createAddress']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'updateAddress': {
    methods: ["PATCH"]
    pattern: '/api/v1/me/addresses/:addressId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/identity/address').updateAddressValidator)>>
      paramsTuple: [ParamValue]
      params: { addressId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/identity/address').updateAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['updateAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['updateAddress']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'deleteAddress': {
    methods: ["DELETE"]
    pattern: '/api/v1/me/addresses/:addressId'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { addressId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['deleteAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/customer/identity/addresses_controller').default['deleteAddress']>>>
    }
  }
  'listMyShops': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['listMyShops']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['listMyShops']>>>
    }
  }
  'getSellerShop': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['getSellerShop']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['getSellerShop']>>>
    }
  }
  'updateShopProfile': {
    methods: ["PATCH"]
    pattern: '/api/v1/seller/shops/:shopSlug'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/shops/update_shop_profile').updateShopProfileValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/shops/update_shop_profile').updateShopProfileValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['updateShopProfile']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shops_controller').default['updateShopProfile']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'getShopShipping': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/shipping'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shipping_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shipping_controller').default['show']>>>
    }
  }
  'replaceShopShipping': {
    methods: ["PUT"]
    pattern: '/api/v1/seller/shops/:shopSlug/shipping'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/shops/replace_shop_shipping').replaceShopShippingValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/shops/replace_shop_shipping').replaceShopShippingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shipping_controller').default['replace']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/shops/shipping_controller').default['replace']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'listShopProducts': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/products'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['index']>>>
    }
  }
  'createProduct': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/products'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/catalog/products').createProductValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/catalog/products').createProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'getShopProduct': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['show']>>>
    }
  }
  'updateProduct': {
    methods: ["PATCH"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/catalog/products').updateProductValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/catalog/products').updateProductValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['update']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['update']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'replaceProductVariants': {
    methods: ["PUT"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/variants'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/catalog/variants').replaceProductVariantsValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/catalog/variants').replaceProductVariantsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['replaceVariants']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['replaceVariants']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'replaceProductMedia': {
    methods: ["PUT"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/media'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/catalog/media').replaceProductMediaValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/catalog/media').replaceProductMediaValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['replaceMedia']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['replaceMedia']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'publishProduct': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/publish'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['publish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['publish']>>>
    }
  }
  'unpublishProduct': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/unpublish'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['unpublish']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['unpublish']>>>
    }
  }
  'archiveProduct': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/archive'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['archive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['archive']>>>
    }
  }
  'restoreProduct': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/products/:productId/restore'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['restore']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/catalog/products_controller').default['restore']>>>
    }
  }
  'listInventory': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/inventory'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['index']>>>
    }
  }
  'adjustInventory': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/inventory/:variantId/adjustments'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/inventory/adjust_inventory').adjustInventoryValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; variantId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/inventory/adjust_inventory').adjustInventoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['adjust']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['adjust']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'stocktakeInventory': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/inventory/:variantId/stocktake'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/inventory/stocktake_inventory').stocktakeInventoryValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; variantId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/inventory/stocktake_inventory').stocktakeInventoryValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['stocktake']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/inventory/inventory_items_controller').default['stocktake']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'createMediaUpload': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/media/uploads'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/media/create_media_upload').createMediaUploadValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/media/create_media_upload').createMediaUploadValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/media/media_uploads_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/media/media_uploads_controller').default['store']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'completeMediaUpload': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/media/:mediaAssetId/complete'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; mediaAssetId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/media/media_uploads_controller').default['complete']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/api/v1/seller/media/media_uploads_controller').default['complete']>>>
    }
  }
  'getLogisticsSettings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/logistics'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['show']>>>
    }
  }
  'replaceLogisticsSettings': {
    methods: ["PUT"]
    pattern: '/api/v1/seller/shops/:shopSlug/logistics'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').replaceLogisticsSettingsValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').replaceLogisticsSettingsValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['replace']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['replace']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'createShopCourierAccount': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').createShopCourierAccountValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').createShopCourierAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['createAccount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['createAccount']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'rekeyShopCourierAccount': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').rekeyShopCourierAccountValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; accountId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').rekeyShopCourierAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['rekeyAccount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['rekeyAccount']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'disableShopCourierAccount': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').disableShopCourierAccountValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; accountId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').disableShopCourierAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['disableAccount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['disableAccount']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'createPickupAddress': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').createPickupAddressValidator)>>
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').createPickupAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['createPickupAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['createPickupAddress']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'updatePickupAddress': {
    methods: ["PATCH"]
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').updatePickupAddressValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; addressId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').updatePickupAddressValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['updatePickupAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['updatePickupAddress']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'archivePickupAddress': {
    methods: ["DELETE"]
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; addressId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['archivePickupAddress']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/logistics_controller').default['archivePickupAddress']>>>
    }
  }
  'getCourierBookingOptions': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; shopOrderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['options']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['options']>>>
    }
  }
  'bookCourierShipment': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').bookCourierShipmentValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; shopOrderNumber: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').bookCourierShipmentValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['book']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['book']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'cancelCourierBooking': {
    methods: ["POST"]
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/seller/logistics').cancelCourierBookingValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; shopOrderNumber: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/seller/logistics').cancelCourierBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['cancel']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/courier_bookings_controller').default['cancel']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminListLogisticsAccounts': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/logistics/accounts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['accounts']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['accounts']>>>
    }
  }
  'adminCreateLogisticsAccount': {
    methods: ["POST"]
    pattern: '/api/v1/admin/logistics/accounts'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').createLogisticsAccountValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').createLogisticsAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['createAccount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['createAccount']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminRekeyLogisticsAccount': {
    methods: ["POST"]
    pattern: '/api/v1/admin/logistics/accounts/:accountId/credentials'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').rekeyLogisticsAccountValidator)>>
      paramsTuple: [ParamValue]
      params: { accountId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').rekeyLogisticsAccountValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['rekeyAccount']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['rekeyAccount']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminAllowShopOnLogisticsAccount': {
    methods: ["PUT"]
    pattern: '/api/v1/admin/logistics/accounts/:accountId/shops/:shopId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').shopLinkValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { accountId: ParamValue; shopId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').shopLinkValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['allowShop']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['allowShop']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminRemoveShopFromLogisticsAccount': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/logistics/accounts/:accountId/shops/:shopId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').shopLinkValidator)>>
      paramsTuple: [ParamValue, ParamValue]
      params: { accountId: ParamValue; shopId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').shopLinkValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['removeShop']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['removeShop']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminSetLogisticsAccountStatus': {
    methods: ["POST"]
    pattern: '/api/v1/admin/logistics/accounts/:accountId/status'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').setLogisticsAccountStatusValidator)>>
      paramsTuple: [ParamValue]
      params: { accountId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').setLogisticsAccountStatusValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['setAccountStatus']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['setAccountStatus']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminSetShopLogisticsEnabled': {
    methods: ["PUT"]
    pattern: '/api/v1/admin/shops/:shopId/logistics-enabled'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').setShopLogisticsEnabledValidator)>>
      paramsTuple: [ParamValue]
      params: { shopId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').setShopLogisticsEnabledValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['setShopEnabled']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['setShopEnabled']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminListLogisticsBranches': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/logistics/branches'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['branches']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['branches']>>>
    }
  }
  'adminSyncLogisticsBranches': {
    methods: ["POST"]
    pattern: '/api/v1/admin/logistics/branches/sync'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').syncBranchesValidator)>>
      paramsTuple: []
      params: {}
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').syncBranchesValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['syncBranches']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['syncBranches']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminUpdateLogisticsBranch': {
    methods: ["PATCH"]
    pattern: '/api/v1/admin/logistics/branches/:branchId'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').updateBranchValidator)>>
      paramsTuple: [ParamValue]
      params: { branchId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').updateBranchValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['updateBranch']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['updateBranch']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminListCourierBookings': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/courier-bookings'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['queue']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['queue']>>>
    }
  }
  'adminResolveCourierBooking': {
    methods: ["POST"]
    pattern: '/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').resolveCourierBookingValidator)>>
      paramsTuple: [ParamValue]
      params: { shopOrderNumber: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').resolveCourierBookingValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['resolve']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['resolve']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminRefreshCourierStatus': {
    methods: ["POST"]
    pattern: '/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopOrderNumber: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['refresh']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['refresh']>>>
    }
  }
  'adminListCourierEvents': {
    methods: ["GET","HEAD"]
    pattern: '/api/v1/admin/courier-events'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['events']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['events']>>>
    }
  }
  'adminResolveCourierEvent': {
    methods: ["POST"]
    pattern: '/api/v1/admin/courier-events/:courierEventId/resolution'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').resolveCourierEventValidator)>>
      paramsTuple: [ParamValue]
      params: { courierEventId: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').resolveCourierEventValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['resolveEvent']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['resolveEvent']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'adminRecordOrderVerification': {
    methods: ["POST"]
    pattern: '/api/v1/admin/orders/:orderNumber/verification'
    types: {
      body: ExtractBody<InferInput<(typeof import('#validators/admin/logistics').recordOrderVerificationValidator)>>
      paramsTuple: [ParamValue]
      params: { orderNumber: ParamValue }
      query: ExtractQuery<InferInput<(typeof import('#validators/admin/logistics').recordOrderVerificationValidator)>>
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['verify']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/courier_bookings_controller').default['verify']>>> | { status: 422; response: { errors: SimpleError[] } }
    }
  }
  'receiveCourierCallback': {
    methods: ["POST"]
    pattern: '/api/v1/webhooks/couriers/:providerCode/:accountId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { providerCode: ParamValue; accountId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/webhooks/courier_callbacks_controller').default['receive']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/webhooks/courier_callbacks_controller').default['receive']>>>
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
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/identity/home_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/identity/home_controller').default['show']>>>
    }
  }
  'legal.document': {
    methods: ["GET","HEAD"]
    pattern: '/legal/:documentSlug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { documentSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/platform/legal_documents_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/platform/legal_documents_controller').default['show']>>>
    }
  }
  'listing.men': {
    methods: ["GET","HEAD"]
    pattern: '/men'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.clothing': {
    methods: ["GET","HEAD"]
    pattern: '/men/clothing'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.t-shirts': {
    methods: ["GET","HEAD"]
    pattern: '/men/t-shirts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.shirts': {
    methods: ["GET","HEAD"]
    pattern: '/men/shirts'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.hoodies': {
    methods: ["GET","HEAD"]
    pattern: '/men/hoodies'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.jeans': {
    methods: ["GET","HEAD"]
    pattern: '/men/jeans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.joggers': {
    methods: ["GET","HEAD"]
    pattern: '/men/joggers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.traditional-wear': {
    methods: ["GET","HEAD"]
    pattern: '/men/traditional-wear'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.footwear': {
    methods: ["GET","HEAD"]
    pattern: '/men/footwear'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.sneakers': {
    methods: ["GET","HEAD"]
    pattern: '/men/sneakers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.bags': {
    methods: ["GET","HEAD"]
    pattern: '/men/bags'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.watches': {
    methods: ["GET","HEAD"]
    pattern: '/men/watches'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.men.accessories': {
    methods: ["GET","HEAD"]
    pattern: '/men/accessories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women': {
    methods: ["GET","HEAD"]
    pattern: '/women'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.clothing': {
    methods: ["GET","HEAD"]
    pattern: '/women/clothing'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.tops': {
    methods: ["GET","HEAD"]
    pattern: '/women/tops'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.dresses': {
    methods: ["GET","HEAD"]
    pattern: '/women/dresses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.jeans': {
    methods: ["GET","HEAD"]
    pattern: '/women/jeans'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.traditional-wear': {
    methods: ["GET","HEAD"]
    pattern: '/women/traditional-wear'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.sarees': {
    methods: ["GET","HEAD"]
    pattern: '/women/sarees'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.kurtas': {
    methods: ["GET","HEAD"]
    pattern: '/women/kurtas'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.footwear': {
    methods: ["GET","HEAD"]
    pattern: '/women/footwear'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.sneakers': {
    methods: ["GET","HEAD"]
    pattern: '/women/sneakers'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.bags': {
    methods: ["GET","HEAD"]
    pattern: '/women/bags'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.watches': {
    methods: ["GET","HEAD"]
    pattern: '/women/watches'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.women.accessories': {
    methods: ["GET","HEAD"]
    pattern: '/women/accessories'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['navigation']>>>
    }
  }
  'listing.category': {
    methods: ["GET","HEAD"]
    pattern: '/c/:categorySlug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { categorySlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['category']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['category']>>>
    }
  }
  'listing.search': {
    methods: ["GET","HEAD"]
    pattern: '/search'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['search']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/listing_controller').default['search']>>>
    }
  }
  'product.show': {
    methods: ["GET","HEAD"]
    pattern: '/p/:segment'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { segment: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/product_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/storefront/catalog/product_controller').default['show']>>>
    }
  }
  'login': {
    methods: ["GET","HEAD"]
    pattern: '/login'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/session_controller').default['logIn']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/session_controller').default['logIn']>>>
    }
  }
  'signup': {
    methods: ["GET","HEAD"]
    pattern: '/signup'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/registration_controller').default['signUp']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/registration_controller').default['signUp']>>>
    }
  }
  'verify_email': {
    methods: ["GET","HEAD"]
    pattern: '/verify-email'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/registration_controller').default['verifyEmail']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/registration_controller').default['verifyEmail']>>>
    }
  }
  'forgot_password': {
    methods: ["GET","HEAD"]
    pattern: '/forgot-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/password_reset_controller').default['forgotPassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/password_reset_controller').default['forgotPassword']>>>
    }
  }
  'reset_password': {
    methods: ["GET","HEAD"]
    pattern: '/reset-password'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/password_reset_controller').default['resetPassword']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/password_reset_controller').default['resetPassword']>>>
    }
  }
  'mfa': {
    methods: ["GET","HEAD"]
    pattern: '/mfa'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/auth/identity/mfa_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/auth/identity/mfa_controller').default['show']>>>
    }
  }
  'account.overview': {
    methods: ["GET","HEAD"]
    pattern: '/account'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['overview']>>>
    }
  }
  'account.addresses': {
    methods: ["GET","HEAD"]
    pattern: '/account/addresses'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['addresses']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['addresses']>>>
    }
  }
  'account.security': {
    methods: ["GET","HEAD"]
    pattern: '/account/security'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['security']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/account/identity/account_controller').default['security']>>>
    }
  }
  'seller.overview': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['overview']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['overview']>>>
    }
  }
  'seller.settings': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/settings'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['settings']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['settings']>>>
    }
  }
  'seller.shipping': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/shipping'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['shipping']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/shops/shop_controller').default['shipping']>>>
    }
  }
  'seller.products': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/products'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['index']>>>
    }
  }
  'seller.products.new': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/products/new'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['create']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['create']>>>
    }
  }
  'seller.products.edit': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/products/:productId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { shopSlug: ParamValue; productId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['edit']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/catalog/products_controller').default['edit']>>>
    }
  }
  'seller.inventory': {
    methods: ["GET","HEAD"]
    pattern: '/seller/:shopSlug/inventory'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { shopSlug: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/seller/inventory/inventory_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/seller/inventory/inventory_controller').default['index']>>>
    }
  }
  'admin.logistics': {
    methods: ["GET","HEAD"]
    pattern: '/admin/logistics'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics/accounts_controller').default['index']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics/accounts_controller').default['index']>>>
    }
  }
  'dev.design_system': {
    methods: ["GET","HEAD"]
    pattern: '/dev/design-system'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dev.overlays': {
    methods: ["GET","HEAD"]
    pattern: '/dev/overlays'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: unknown
      errorResponse: unknown
    }
  }
  'dev.sign_in': {
    methods: ["GET","HEAD"]
    pattern: '/dev/sign-in'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['show']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['show']>>>
    }
  }
  'dev.sign_in.store': {
    methods: ["POST"]
    pattern: '/dev/sign-in/:id'
    types: {
      body: {}
      paramsTuple: [ParamValue]
      params: { id: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['store']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['store']>>>
    }
  }
  'dev.sign_out': {
    methods: ["POST"]
    pattern: '/dev/sign-out'
    types: {
      body: {}
      paramsTuple: []
      params: {}
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['destroy']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/dev/sign_in_controller').default['destroy']>>>
    }
  }
}
