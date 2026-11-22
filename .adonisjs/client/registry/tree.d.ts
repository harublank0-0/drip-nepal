/* eslint-disable prettier/prettier */
import type { routes } from './index.ts'

export interface ApiDefinition {
  drive: {
    fs: {
      serve: typeof routes['drive.fs.serve']
    }
  }
  signUp: typeof routes['signUp']
  resendEmailVerification: typeof routes['resendEmailVerification']
  confirmEmail: typeof routes['confirmEmail']
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
  legal: {
    document: typeof routes['legal.document']
  }
  signup: typeof routes['signup']
  verifyEmail: typeof routes['verify_email']
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
