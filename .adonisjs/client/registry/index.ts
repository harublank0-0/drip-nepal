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
  'verifyMfaChallenge': {
    methods: ["POST"],
    pattern: '/api/v1/auth/mfa/challenge',
    tokens: [{"old":"/api/v1/auth/mfa/challenge","type":0,"val":"api","end":""},{"old":"/api/v1/auth/mfa/challenge","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/mfa/challenge","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/mfa/challenge","type":0,"val":"mfa","end":""},{"old":"/api/v1/auth/mfa/challenge","type":0,"val":"challenge","end":""}],
    types: placeholder as Registry['verifyMfaChallenge']['types'],
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
  'requestPasswordReset': {
    methods: ["POST"],
    pattern: '/api/v1/auth/password-reset',
    tokens: [{"old":"/api/v1/auth/password-reset","type":0,"val":"api","end":""},{"old":"/api/v1/auth/password-reset","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/password-reset","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/password-reset","type":0,"val":"password-reset","end":""}],
    types: placeholder as Registry['requestPasswordReset']['types'],
  },
  'resetPassword': {
    methods: ["POST"],
    pattern: '/api/v1/auth/password-reset/confirm',
    tokens: [{"old":"/api/v1/auth/password-reset/confirm","type":0,"val":"api","end":""},{"old":"/api/v1/auth/password-reset/confirm","type":0,"val":"v1","end":""},{"old":"/api/v1/auth/password-reset/confirm","type":0,"val":"auth","end":""},{"old":"/api/v1/auth/password-reset/confirm","type":0,"val":"password-reset","end":""},{"old":"/api/v1/auth/password-reset/confirm","type":0,"val":"confirm","end":""}],
    types: placeholder as Registry['resetPassword']['types'],
  },
  'getMe': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/me',
    tokens: [{"old":"/api/v1/me","type":0,"val":"api","end":""},{"old":"/api/v1/me","type":0,"val":"v1","end":""},{"old":"/api/v1/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['getMe']['types'],
  },
  'updateMe': {
    methods: ["PATCH"],
    pattern: '/api/v1/me',
    tokens: [{"old":"/api/v1/me","type":0,"val":"api","end":""},{"old":"/api/v1/me","type":0,"val":"v1","end":""},{"old":"/api/v1/me","type":0,"val":"me","end":""}],
    types: placeholder as Registry['updateMe']['types'],
  },
  'requestAccountDeletion': {
    methods: ["POST"],
    pattern: '/api/v1/me/deletion-request',
    tokens: [{"old":"/api/v1/me/deletion-request","type":0,"val":"api","end":""},{"old":"/api/v1/me/deletion-request","type":0,"val":"v1","end":""},{"old":"/api/v1/me/deletion-request","type":0,"val":"me","end":""},{"old":"/api/v1/me/deletion-request","type":0,"val":"deletion-request","end":""}],
    types: placeholder as Registry['requestAccountDeletion']['types'],
  },
  'changePassword': {
    methods: ["POST"],
    pattern: '/api/v1/me/password',
    tokens: [{"old":"/api/v1/me/password","type":0,"val":"api","end":""},{"old":"/api/v1/me/password","type":0,"val":"v1","end":""},{"old":"/api/v1/me/password","type":0,"val":"me","end":""},{"old":"/api/v1/me/password","type":0,"val":"password","end":""}],
    types: placeholder as Registry['changePassword']['types'],
  },
  'revokeAllSessions': {
    methods: ["POST"],
    pattern: '/api/v1/me/sessions/revoke-all',
    tokens: [{"old":"/api/v1/me/sessions/revoke-all","type":0,"val":"api","end":""},{"old":"/api/v1/me/sessions/revoke-all","type":0,"val":"v1","end":""},{"old":"/api/v1/me/sessions/revoke-all","type":0,"val":"me","end":""},{"old":"/api/v1/me/sessions/revoke-all","type":0,"val":"sessions","end":""},{"old":"/api/v1/me/sessions/revoke-all","type":0,"val":"revoke-all","end":""}],
    types: placeholder as Registry['revokeAllSessions']['types'],
  },
  'startTotpEnrollment': {
    methods: ["POST"],
    pattern: '/api/v1/me/mfa/totp',
    tokens: [{"old":"/api/v1/me/mfa/totp","type":0,"val":"api","end":""},{"old":"/api/v1/me/mfa/totp","type":0,"val":"v1","end":""},{"old":"/api/v1/me/mfa/totp","type":0,"val":"me","end":""},{"old":"/api/v1/me/mfa/totp","type":0,"val":"mfa","end":""},{"old":"/api/v1/me/mfa/totp","type":0,"val":"totp","end":""}],
    types: placeholder as Registry['startTotpEnrollment']['types'],
  },
  'confirmTotpEnrollment': {
    methods: ["POST"],
    pattern: '/api/v1/me/mfa/totp/confirm',
    tokens: [{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"api","end":""},{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"v1","end":""},{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"me","end":""},{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"mfa","end":""},{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"totp","end":""},{"old":"/api/v1/me/mfa/totp/confirm","type":0,"val":"confirm","end":""}],
    types: placeholder as Registry['confirmTotpEnrollment']['types'],
  },
  'listProvinces': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/locations/provinces',
    tokens: [{"old":"/api/v1/locations/provinces","type":0,"val":"api","end":""},{"old":"/api/v1/locations/provinces","type":0,"val":"v1","end":""},{"old":"/api/v1/locations/provinces","type":0,"val":"locations","end":""},{"old":"/api/v1/locations/provinces","type":0,"val":"provinces","end":""}],
    types: placeholder as Registry['listProvinces']['types'],
  },
  'listDistricts': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/locations/districts',
    tokens: [{"old":"/api/v1/locations/districts","type":0,"val":"api","end":""},{"old":"/api/v1/locations/districts","type":0,"val":"v1","end":""},{"old":"/api/v1/locations/districts","type":0,"val":"locations","end":""},{"old":"/api/v1/locations/districts","type":0,"val":"districts","end":""}],
    types: placeholder as Registry['listDistricts']['types'],
  },
  'listLocalLevels': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/locations/local-levels',
    tokens: [{"old":"/api/v1/locations/local-levels","type":0,"val":"api","end":""},{"old":"/api/v1/locations/local-levels","type":0,"val":"v1","end":""},{"old":"/api/v1/locations/local-levels","type":0,"val":"locations","end":""},{"old":"/api/v1/locations/local-levels","type":0,"val":"local-levels","end":""}],
    types: placeholder as Registry['listLocalLevels']['types'],
  },
  'listAddresses': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/me/addresses',
    tokens: [{"old":"/api/v1/me/addresses","type":0,"val":"api","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"v1","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"me","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"addresses","end":""}],
    types: placeholder as Registry['listAddresses']['types'],
  },
  'createAddress': {
    methods: ["POST"],
    pattern: '/api/v1/me/addresses',
    tokens: [{"old":"/api/v1/me/addresses","type":0,"val":"api","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"v1","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"me","end":""},{"old":"/api/v1/me/addresses","type":0,"val":"addresses","end":""}],
    types: placeholder as Registry['createAddress']['types'],
  },
  'updateAddress': {
    methods: ["PATCH"],
    pattern: '/api/v1/me/addresses/:addressId',
    tokens: [{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"api","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"v1","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"me","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"addresses","end":""},{"old":"/api/v1/me/addresses/:addressId","type":1,"val":"addressId","end":""}],
    types: placeholder as Registry['updateAddress']['types'],
  },
  'deleteAddress': {
    methods: ["DELETE"],
    pattern: '/api/v1/me/addresses/:addressId',
    tokens: [{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"api","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"v1","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"me","end":""},{"old":"/api/v1/me/addresses/:addressId","type":0,"val":"addresses","end":""},{"old":"/api/v1/me/addresses/:addressId","type":1,"val":"addressId","end":""}],
    types: placeholder as Registry['deleteAddress']['types'],
  },
  'listMyShops': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/seller/shops',
    tokens: [{"old":"/api/v1/seller/shops","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops","type":0,"val":"shops","end":""}],
    types: placeholder as Registry['listMyShops']['types'],
  },
  'getSellerShop': {
    methods: ["GET","HEAD"],
    pattern: '/api/v1/seller/shops/:shopSlug',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":1,"val":"shopSlug","end":""}],
    types: placeholder as Registry['getSellerShop']['types'],
  },
  'updateShopProfile': {
    methods: ["PATCH"],
    pattern: '/api/v1/seller/shops/:shopSlug',
    tokens: [{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"api","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"v1","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"seller","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":0,"val":"shops","end":""},{"old":"/api/v1/seller/shops/:shopSlug","type":1,"val":"shopSlug","end":""}],
    types: placeholder as Registry['updateShopProfile']['types'],
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
  'forgot_password': {
    methods: ["GET","HEAD"],
    pattern: '/forgot-password',
    tokens: [{"old":"/forgot-password","type":0,"val":"forgot-password","end":""}],
    types: placeholder as Registry['forgot_password']['types'],
  },
  'reset_password': {
    methods: ["GET","HEAD"],
    pattern: '/reset-password',
    tokens: [{"old":"/reset-password","type":0,"val":"reset-password","end":""}],
    types: placeholder as Registry['reset_password']['types'],
  },
  'mfa': {
    methods: ["GET","HEAD"],
    pattern: '/mfa',
    tokens: [{"old":"/mfa","type":0,"val":"mfa","end":""}],
    types: placeholder as Registry['mfa']['types'],
  },
  'account.overview': {
    methods: ["GET","HEAD"],
    pattern: '/account',
    tokens: [{"old":"/account","type":0,"val":"account","end":""}],
    types: placeholder as Registry['account.overview']['types'],
  },
  'account.addresses': {
    methods: ["GET","HEAD"],
    pattern: '/account/addresses',
    tokens: [{"old":"/account/addresses","type":0,"val":"account","end":""},{"old":"/account/addresses","type":0,"val":"addresses","end":""}],
    types: placeholder as Registry['account.addresses']['types'],
  },
  'account.security': {
    methods: ["GET","HEAD"],
    pattern: '/account/security',
    tokens: [{"old":"/account/security","type":0,"val":"account","end":""},{"old":"/account/security","type":0,"val":"security","end":""}],
    types: placeholder as Registry['account.security']['types'],
  },
  'seller.overview': {
    methods: ["GET","HEAD"],
    pattern: '/seller/:shopSlug',
    tokens: [{"old":"/seller/:shopSlug","type":0,"val":"seller","end":""},{"old":"/seller/:shopSlug","type":1,"val":"shopSlug","end":""}],
    types: placeholder as Registry['seller.overview']['types'],
  },
  'seller.settings': {
    methods: ["GET","HEAD"],
    pattern: '/seller/:shopSlug/settings',
    tokens: [{"old":"/seller/:shopSlug/settings","type":0,"val":"seller","end":""},{"old":"/seller/:shopSlug/settings","type":1,"val":"shopSlug","end":""},{"old":"/seller/:shopSlug/settings","type":0,"val":"settings","end":""}],
    types: placeholder as Registry['seller.settings']['types'],
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
