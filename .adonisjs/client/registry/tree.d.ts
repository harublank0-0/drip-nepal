/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  drive: {
    fs: {
      serve: typeof routes['drive.fs.serve']
    }
  }
  signUp: typeof routes['signUp']
  logIn: typeof routes['logIn']
  logOut: typeof routes['logOut']
  verifyMfaChallenge: typeof routes['verifyMfaChallenge']
  resendEmailVerification: typeof routes['resendEmailVerification']
  confirmEmail: typeof routes['confirmEmail']
  requestPasswordReset: typeof routes['requestPasswordReset']
  resetPassword: typeof routes['reset_password']
  getMe: typeof routes['getMe']
  updateMe: typeof routes['updateMe']
  requestAccountDeletion: typeof routes['requestAccountDeletion']
  changePassword: typeof routes['changePassword']
  revokeAllSessions: typeof routes['revokeAllSessions']
  startTotpEnrollment: typeof routes['startTotpEnrollment']
  confirmTotpEnrollment: typeof routes['confirmTotpEnrollment']
  listProvinces: typeof routes['listProvinces']
  listDistricts: typeof routes['listDistricts']
  listLocalLevels: typeof routes['listLocalLevels']
  listAddresses: typeof routes['listAddresses']
  createAddress: typeof routes['createAddress']
  updateAddress: typeof routes['updateAddress']
  deleteAddress: typeof routes['deleteAddress']
  listMyShops: typeof routes['listMyShops']
  getSellerShop: typeof routes['getSellerShop']
  updateShopProfile: typeof routes['updateShopProfile']
  getShopShipping: typeof routes['getShopShipping']
  replaceShopShipping: typeof routes['replaceShopShipping']
  listShopProducts: typeof routes['listShopProducts']
  createProduct: typeof routes['createProduct']
  getShopProduct: typeof routes['getShopProduct']
  updateProduct: typeof routes['updateProduct']
  replaceProductVariants: typeof routes['replaceProductVariants']
  replaceProductMedia: typeof routes['replaceProductMedia']
  publishProduct: typeof routes['publishProduct']
  unpublishProduct: typeof routes['unpublishProduct']
  archiveProduct: typeof routes['archiveProduct']
  restoreProduct: typeof routes['restoreProduct']
  listInventory: typeof routes['listInventory']
  adjustInventory: typeof routes['adjustInventory']
  stocktakeInventory: typeof routes['stocktakeInventory']
  createMediaUpload: typeof routes['createMediaUpload']
  completeMediaUpload: typeof routes['completeMediaUpload']
  getLogisticsSettings: typeof routes['getLogisticsSettings']
  replaceLogisticsSettings: typeof routes['replaceLogisticsSettings']
  createShopCourierAccount: typeof routes['createShopCourierAccount']
  rekeyShopCourierAccount: typeof routes['rekeyShopCourierAccount']
  disableShopCourierAccount: typeof routes['disableShopCourierAccount']
  createPickupAddress: typeof routes['createPickupAddress']
  updatePickupAddress: typeof routes['updatePickupAddress']
  archivePickupAddress: typeof routes['archivePickupAddress']
  getCourierBookingOptions: typeof routes['getCourierBookingOptions']
  bookCourierShipment: typeof routes['bookCourierShipment']
  cancelCourierBooking: typeof routes['cancelCourierBooking']
  adminListLogisticsAccounts: typeof routes['adminListLogisticsAccounts']
  adminCreateLogisticsAccount: typeof routes['adminCreateLogisticsAccount']
  adminRekeyLogisticsAccount: typeof routes['adminRekeyLogisticsAccount']
  adminAllowShopOnLogisticsAccount: typeof routes['adminAllowShopOnLogisticsAccount']
  adminRemoveShopFromLogisticsAccount: typeof routes['adminRemoveShopFromLogisticsAccount']
  adminSetLogisticsAccountStatus: typeof routes['adminSetLogisticsAccountStatus']
  adminSetShopLogisticsEnabled: typeof routes['adminSetShopLogisticsEnabled']
  adminListLogisticsBranches: typeof routes['adminListLogisticsBranches']
  adminSyncLogisticsBranches: typeof routes['adminSyncLogisticsBranches']
  adminUpdateLogisticsBranch: typeof routes['adminUpdateLogisticsBranch']
  adminListCourierBookings: typeof routes['adminListCourierBookings']
  adminResolveCourierBooking: typeof routes['adminResolveCourierBooking']
  adminRefreshCourierStatus: typeof routes['adminRefreshCourierStatus']
  adminListCourierEvents: typeof routes['adminListCourierEvents']
  adminResolveCourierEvent: typeof routes['adminResolveCourierEvent']
  adminRecordOrderVerification: typeof routes['adminRecordOrderVerification']
  receiveCourierCallback: typeof routes['receiveCourierCallback']
  home: typeof routes['home']
  legal: {
    document: typeof routes['legal.document']
  }
  login: typeof routes['login']
  signup: typeof routes['signup']
  verifyEmail: typeof routes['verify_email']
  forgotPassword: typeof routes['forgot_password']
  mfa: typeof routes['mfa']
  account: {
    overview: typeof routes['account.overview']
    addresses: typeof routes['account.addresses']
    security: typeof routes['account.security']
  }
  seller: {
    overview: typeof routes['seller.overview']
    settings: typeof routes['seller.settings']
    shipping: typeof routes['seller.shipping']
    products: typeof routes['seller.products'] & {
      new: typeof routes['seller.products.new']
      edit: typeof routes['seller.products.edit']
    }
  }
  admin: {
    logistics: typeof routes['admin.logistics']
  }
  dev: {
    designSystem: typeof routes['dev.design_system']
    overlays: typeof routes['dev.overlays']
    signIn: typeof routes['dev.sign_in'] & {
      store: typeof routes['dev.sign_in.store']
    }
    signOut: typeof routes['dev.sign_out']
  }
}
