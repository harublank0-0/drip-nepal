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
  'signUp': {
    methods: ["POST"],
    pattern: '/api/v1/auth/signup',
    tokens: [{"old":"/api/v1/auth/signup","type":0,"val":"api","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['signUp']['types'],
  },
  'logIn': {
    methods: ["POST"],
    pattern: '/api/v1/auth/session',
    tokens: [{"old":"/api/v1/auth/session","type":0,"val":"api","end":""},{"old":"/api/v1/auth/session","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/session","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/session","type":0,"val":"session","end":""}],
    types: placeholder as Registry['logIn']['types'],
  },
  'logOut': {
    methods: ["DELETE"],
    pattern: '/api/v1/auth/session',
    tokens: [{"old":"/api/v1/auth/session","type":0,"val":"api","end":""},{"old":"/api/v1/auth/session","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/session","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/session","type":0,"val":"session","end":""}],
    types: placeholder as Registry['logOut']['types'],
  },
  'resendEmailVerification': {
    methods: ["POST"],
    pattern: '/api/v1/auth/email-verification',
    tokens: [{"old":"/api/v1/auth/email-verification","type":0,"val":"api","end":""},{"old":"/api/v1/auth/email-verification","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/email-verification","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/email-verification","type":0,"val":"email-verification","end":""}],
    types: placeholder as Registry['resendEmailVerification']['types'],
  },
  'confirmEmail': {
    methods: ["POST"],
    pattern: '/api/v1/auth/email-verification/confirm',
    tokens: [{"old":"/api/v1/auth/email-verification/confirm","type":0,"val":"api","end":""},{"old":"/api/v1/auth/email-verification/confirm","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/email-verification/confirm","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/email-verification/confirm","type":0,"val":"email-verification","end":""},{"old":"/api/v1/auth/email-verification/confirm","type":0,"val":"confirm","end":""}],
    types: placeholder as Registry['confirmEmail']['types'],
  },
  'getMe': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/me',
    tokens: [{"old":"/api/v1/me","type":0,"val":"api","end":""},{"old":"/api/v1/me","type":0,"val":"v1","end":""},{"old":"/api/v1/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['getMe']['types'],
  },
  'getLogisticsSettings': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/seller/shops/:shopSlug/logistics',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"logistics","end":""}],
    types: placeholder as Registry['getLogisticsSettings']['types'],
  },
  'replaceLogisticsSettings': {
    methods: ["PUT"],
    pattern: '/api/v1/seller/shops/:shopSlug/logistics',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/logistics","type":0,"val":"logistics","end":""}],
    types: placeholder as Registry['replaceLogisticsSettings']['types'],
  },
  'createShopCourierAccount': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts","type":0,"val":"courier-accounts","end":""}],
    types: placeholder as Registry['createShopCourierAccount']['types'],
  },
  'rekeyShopCourierAccount': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"courier-accounts","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":1,"val":"accountId","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/credentials","type":0,"val":"credentials","end":""}],
    types: placeholder as Registry['rekeyShopCourierAccount']['types'],
  },
  'disableShopCourierAccount': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"courier-accounts","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":1,"val":"accountId","end":""},{"old":"/api/v1/seller/shops/:shopSlug/courier-accounts/:accountId/disable","type":0,"val":"disable","end":""}],
    types: placeholder as Registry['disableShopCourierAccount']['types'],
  },
  'createPickupAddress': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses","type":0,"val":"pickup-addresses","end":""}],
    types: placeholder as Registry['createPickupAddress']['types'],
  },
  'updatePickupAddress': {
    methods: ["PATCH"],
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"pickup-addresses","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":1,"val":"addressId","end":""}],
    types: placeholder as Registry['updatePickupAddress']['types'],
  },
  'archivePickupAddress': {
    methods: ["DELETE"],
    pattern: '/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":0,"val":"pickup-addresses","end":""},{"old":"/api/v1/seller/shops/:shopSlug/pickup-addresses/:addressId","type":1,"val":"addressId","end":""}],
    types: placeholder as Registry['archivePickupAddress']['types'],
  },
  'getCourierBookingOptions': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"orders","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":1,"val":"shopOrderNumber","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking-options","type":0,"val":"courier-booking-options","end":""}],
    types: placeholder as Registry['getCourierBookingOptions']['types'],
  },
  'bookCourierShipment': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"orders","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":1,"val":"shopOrderNumber","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking","type":0,"val":"courier-booking","end":""}],
    types: placeholder as Registry['bookCourierShipment']['types'],
  },
  'cancelCourierBooking': {
    methods: ["POST"],
    pattern: '/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":1,"val":"shopSlug","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"orders","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":1,"val":"shopOrderNumber","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"courier-booking","end":""},{"old":"/api/v1/seller/shops/:shopSlug/orders/:shopOrderNumber/courier-booking/cancel","type":0,"val":"cancel","end":""}],
    types: placeholder as Registry['cancelCourierBooking']['types'],
  },
  'adminListLogisticsAccounts': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/logistics/accounts',
    tokens: [{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"accounts","end":""}],
    types: placeholder as Registry['adminListLogisticsAccounts']['types'],
  },
  'adminCreateLogisticsAccount': {
    methods: ["POST"],
    pattern: '/api/v1/admin/logistics/accounts',
    tokens: [{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts","type":0,"val":"accounts","end":""}],
    types: placeholder as Registry['adminCreateLogisticsAccount']['types'],
  },
  'adminRekeyLogisticsAccount': {
    methods: ["POST"],
    pattern: '/api/v1/admin/logistics/accounts/:accountId/credentials',
    tokens: [{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"accounts","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":1,"val":"accountId","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/credentials","type":0,"val":"credentials","end":""}],
    types: placeholder as Registry['adminRekeyLogisticsAccount']['types'],
  },
  'adminAllowShopOnLogisticsAccount': {
    methods: ["PUT"],
    pattern: '/api/v1/admin/logistics/accounts/:accountId/shops/:shopId',
    tokens: [{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"accounts","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":1,"val":"accountId","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"shops","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":1,"val":"shopId","end":""}],
    types: placeholder as Registry['adminAllowShopOnLogisticsAccount']['types'],
  },
  'adminRemoveShopFromLogisticsAccount': {
    methods: ["DELETE"],
    pattern: '/api/v1/admin/logistics/accounts/:accountId/shops/:shopId',
    tokens: [{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"accounts","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":1,"val":"accountId","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":0,"val":"shops","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/shops/:shopId","type":1,"val":"shopId","end":""}],
    types: placeholder as Registry['adminRemoveShopFromLogisticsAccount']['types'],
  },
  'adminSetLogisticsAccountStatus': {
    methods: ["POST"],
    pattern: '/api/v1/admin/logistics/accounts/:accountId/status',
    tokens: [{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"accounts","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":1,"val":"accountId","end":""},{"old":"/api/v1/admin/logistics/accounts/:accountId/status","type":0,"val":"status","end":""}],
    types: placeholder as Registry['adminSetLogisticsAccountStatus']['types'],
  },
  'adminSetShopLogisticsEnabled': {
    methods: ["PUT"],
    pattern: '/api/v1/admin/shops/:shopId/logistics-enabled',
    tokens: [{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":0,"val":"api","end":""},{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":0,"val":"shops","end":""},{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":1,"val":"shopId","end":""},{"old":"/api/v1/admin/shops/:shopId/logistics-enabled","type":0,"val":"logistics-enabled","end":""}],
    types: placeholder as Registry['adminSetShopLogisticsEnabled']['types'],
  },
  'adminListLogisticsBranches': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/logistics/branches',
    tokens: [{"old":"/api/v1/admin/logistics/branches","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/branches","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/branches","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/branches","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/branches","type":0,"val":"branches","end":""}],
    types: placeholder as Registry['adminListLogisticsBranches']['types'],
  },
  'adminSyncLogisticsBranches': {
    methods: ["POST"],
    pattern: '/api/v1/admin/logistics/branches/sync',
    tokens: [{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"branches","end":""},{"old":"/api/v1/admin/logistics/branches/sync","type":0,"val":"sync","end":""}],
    types: placeholder as Registry['adminSyncLogisticsBranches']['types'],
  },
  'adminUpdateLogisticsBranch': {
    methods: ["PATCH"],
    pattern: '/api/v1/admin/logistics/branches/:branchId',
    tokens: [{"old":"/api/v1/admin/logistics/branches/:branchId","type":0,"val":"api","end":""},{"old":"/api/v1/admin/logistics/branches/:branchId","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/logistics/branches/:branchId","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/logistics/branches/:branchId","type":0,"val":"logistics","end":""},{"old":"/api/v1/admin/logistics/branches/:branchId","type":0,"val":"branches","end":""},{"old":"/api/v1/admin/logistics/branches/:branchId","type":1,"val":"branchId","end":""}],
    types: placeholder as Registry['adminUpdateLogisticsBranch']['types'],
  },
  'adminListCourierBookings': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/courier-bookings',
    tokens: [{"old":"/api/v1/admin/courier-bookings","type":0,"val":"api","end":""},{"old":"/api/v1/admin/courier-bookings","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/courier-bookings","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/courier-bookings","type":0,"val":"courier-bookings","end":""}],
    types: placeholder as Registry['adminListCourierBookings']['types'],
  },
  'adminResolveCourierBooking': {
    methods: ["POST"],
    pattern: '/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution',
    tokens: [{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"api","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"shop-orders","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":1,"val":"shopOrderNumber","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"courier-booking","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-booking/resolution","type":0,"val":"resolution","end":""}],
    types: placeholder as Registry['adminResolveCourierBooking']['types'],
  },
  'adminRefreshCourierStatus': {
    methods: ["POST"],
    pattern: '/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh',
    tokens: [{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":0,"val":"api","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":0,"val":"shop-orders","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":1,"val":"shopOrderNumber","end":""},{"old":"/api/v1/admin/shop-orders/:shopOrderNumber/courier-refresh","type":0,"val":"courier-refresh","end":""}],
    types: placeholder as Registry['adminRefreshCourierStatus']['types'],
  },
  'adminListCourierEvents': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/admin/courier-events',
    tokens: [{"old":"/api/v1/admin/courier-events","type":0,"val":"api","end":""},{"old":"/api/v1/admin/courier-events","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/courier-events","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/courier-events","type":0,"val":"courier-events","end":""}],
    types: placeholder as Registry['adminListCourierEvents']['types'],
  },
  'adminResolveCourierEvent': {
    methods: ["POST"],
    pattern: '/api/v1/admin/courier-events/:courierEventId/resolution',
    tokens: [{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":0,"val":"api","end":""},{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":0,"val":"courier-events","end":""},{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":1,"val":"courierEventId","end":""},{"old":"/api/v1/admin/courier-events/:courierEventId/resolution","type":0,"val":"resolution","end":""}],
    types: placeholder as Registry['adminResolveCourierEvent']['types'],
  },
  'adminRecordOrderVerification': {
    methods: ["POST"],
    pattern: '/api/v1/admin/orders/:orderNumber/verification',
    tokens: [{"old":"/api/v1/admin/orders/:orderNumber/verification","type":0,"val":"api","end":""},{"old":"/api/v1/admin/orders/:orderNumber/verification","type":0,"val":"v1","end":""},{"old":"/api/v1/admin/orders/:orderNumber/verification","type":0,"val":"admin","end":""},{"old":"/api/v1/admin/orders/:orderNumber/verification","type":0,"val":"orders","end":""},{"old":"/api/v1/admin/orders/:orderNumber/verification","type":1,"val":"orderNumber","end":""},{"old":"/api/v1/admin/orders/:orderNumber/verification","type":0,"val":"verification","end":""}],
    types: placeholder as Registry['adminRecordOrderVerification']['types'],
  },
  'receiveCourierCallback': {
    methods: ["POST"],
    pattern: '/api/v1/webhooks/couriers/:providerCode/:accountId',
    tokens: [{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":0,"val":"api","end":""},{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":0,"val":"v1","end":""},{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":0,"val":"webhooks","end":""},{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":0,"val":"couriers","end":""},{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":1,"val":"providerCode","end":""},{"old":"/api/v1/webhooks/couriers/:providerCode/:accountId","type":1,"val":"accountId","end":""}],
    types: placeholder as Registry['receiveCourierCallback']['types'],
  },
  'home': {
    methods: ["GET","HEAD"],
    pattern: '/',
    tokens: [{"old":"/","type":0,"val":"/","end":""}],
    types: placeholder as Registry['home']['types'],
  },
  'legal.document': {
    methods: ["GET","HEAD"],
    pattern: '/legal/:documentSlug',
    tokens: [{"old":"/legal/:documentSlug","type":0,"val":"legal","end":""},{"old":"/legal/:documentSlug","type":1,"val":"documentSlug","end":""}],
    types: placeholder as Registry['legal.document']['types'],
  },
  'login': {
    methods: ["GET","HEAD"],
    pattern: '/login',
    tokens: [{"old":"/login","type":0,"val":"login","end":""}],
    types: placeholder as Registry['login']['types'],
  },
  'signup': {
    methods: ["GET","HEAD"],
    pattern: '/signup',
    tokens: [{"old":"/signup","type":0,"val":"signup","end":""}],
    types: placeholder as Registry['signup']['types'],
  },
  'verify_email': {
    methods: ["GET","HEAD"],
    pattern: '/verify-email',
    tokens: [{"old":"/verify-email","type":0,"val":"verify-email","end":""}],
    types: placeholder as Registry['verify_email']['types'],
  },
  'admin.logistics': {
    methods: ["GET","HEAD"],
    pattern: '/admin/logistics',
    tokens: [{"old":"/admin/logistics","type":0,"val":"admin","end":""},{"old":"/admin/logistics","type":0,"val":"logistics","end":""}],
    types: placeholder as Registry['admin.logistics']['types'],
  },
  'dev.design_system': {
    methods: ["GET","HEAD"],
    pattern: '/dev/design-system',
    tokens: [{"old":"/dev/design-system","type":0,"val":"dev","end":""},{"old":"/dev/design-system","type":0,"val":"design-system","end":""}],
    types: placeholder as Registry['dev.design_system']['types'],
  },
  'dev.overlays': {
    methods: ["GET","HEAD"],
    pattern: '/dev/overlays',
    tokens: [{"old":"/dev/overlays","type":0,"val":"dev","end":""},{"old":"/dev/overlays","type":0,"val":"overlays","end":""}],
    types: placeholder as Registry['dev.overlays']['types'],
  },
  'dev.sign_in': {
    methods: ["GET","HEAD"],
    pattern: '/dev/sign-in',
    tokens: [{"old":"/dev/sign-in","type":0,"val":"dev","end":""},{"old":"/dev/sign-in","type":0,"val":"sign-in","end":""}],
    types: placeholder as Registry['dev.sign_in']['types'],
  },
  'dev.sign_in.store': {
    methods: ["POST"],
    pattern: '/dev/sign-in/:id',
    tokens: [{"old":"/dev/sign-in/:id","type":0,"val":"dev","end":""},{"old":"/dev/sign-in/:id","type":0,"val":"sign-in","end":""},{"old":"/dev/sign-in/:id","type":1,"val":"id","end":""}],
    types: placeholder as Registry['dev.sign_in.store']['types'],
  },
  'dev.sign_out': {
    methods: ["POST"],
    pattern: '/dev/sign-out',
    tokens: [{"old":"/dev/sign-out","type":0,"val":"dev","end":""},{"old":"/dev/sign-out","type":0,"val":"sign-out","end":""}],
    types: placeholder as Registry['dev.sign_out']['types'],
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
