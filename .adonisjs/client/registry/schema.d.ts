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
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { accountId: ParamValue; shopId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['allowShop']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['allowShop']>>>
    }
  }
  'adminRemoveShopFromLogisticsAccount': {
    methods: ["DELETE"]
    pattern: '/api/v1/admin/logistics/accounts/:accountId/shops/:shopId'
    types: {
      body: {}
      paramsTuple: [ParamValue, ParamValue]
      params: { accountId: ParamValue; shopId: ParamValue }
      query: {}
      response: ExtractResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['removeShop']>>>
      errorResponse: ExtractErrorResponse<Awaited<ReturnType<import('#controllers/admin/logistics_controller').default['removeShop']>>>
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
}
