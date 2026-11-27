import '@adonisjs/core/types/http'

type ParamValue = string | number | bigint | boolean

export type ScannedRoutes = {
  ALL: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'signUp': { paramsTuple?: []; params?: {} }
    'logIn': { paramsTuple?: []; params?: {} }
    'logOut': { paramsTuple?: []; params?: {} }
    'verifyMfaChallenge': { paramsTuple?: []; params?: {} }
    'resendEmailVerification': { paramsTuple?: []; params?: {} }
    'confirmEmail': { paramsTuple?: []; params?: {} }
    'requestPasswordReset': { paramsTuple?: []; params?: {} }
    'resetPassword': { paramsTuple?: []; params?: {} }
    'getMe': { paramsTuple?: []; params?: {} }
    'updateMe': { paramsTuple?: []; params?: {} }
    'requestAccountDeletion': { paramsTuple?: []; params?: {} }
    'changePassword': { paramsTuple?: []; params?: {} }
    'revokeAllSessions': { paramsTuple?: []; params?: {} }
    'startTotpEnrollment': { paramsTuple?: []; params?: {} }
    'confirmTotpEnrollment': { paramsTuple?: []; params?: {} }
    'listProvinces': { paramsTuple?: []; params?: {} }
    'listDistricts': { paramsTuple?: []; params?: {} }
    'listLocalLevels': { paramsTuple?: []; params?: {} }
    'listCategories': { paramsTuple?: []; params?: {} }
    'listAttributes': { paramsTuple?: []; params?: {} }
    'listProducts': { paramsTuple?: []; params?: {} }
    'getProduct': { paramsTuple: [ParamValue]; params: {'publicId': ParamValue} }
    'listAddresses': { paramsTuple?: []; params?: {} }
    'createAddress': { paramsTuple?: []; params?: {} }
    'updateAddress': { paramsTuple: [ParamValue]; params: {'addressId': ParamValue} }
    'deleteAddress': { paramsTuple: [ParamValue]; params: {'addressId': ParamValue} }
    'listMyShops': { paramsTuple?: []; params?: {} }
    'getSellerShop': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'updateShopProfile': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopShipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'replaceShopShipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'listShopProducts': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'createProduct': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'updateProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'replaceProductVariants': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'replaceProductMedia': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'publishProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'unpublishProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'archiveProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'restoreProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'listInventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'adjustInventory': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'stocktakeInventory': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'createMediaUpload': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'completeMediaUpload': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'mediaAssetId': ParamValue} }
    'getLogisticsSettings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'replaceLogisticsSettings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'createShopCourierAccount': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'rekeyShopCourierAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'accountId': ParamValue} }
    'disableShopCourierAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'accountId': ParamValue} }
    'createPickupAddress': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'updatePickupAddress': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'addressId': ParamValue} }
    'archivePickupAddress': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'addressId': ParamValue} }
    'getCourierBookingOptions': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'bookCourierShipment': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'cancelCourierBooking': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'adminListLogisticsAccounts': { paramsTuple?: []; params?: {} }
    'adminCreateLogisticsAccount': { paramsTuple?: []; params?: {} }
    'adminRekeyLogisticsAccount': { paramsTuple: [ParamValue]; params: {'accountId': ParamValue} }
    'adminAllowShopOnLogisticsAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'accountId': ParamValue,'shopId': ParamValue} }
    'adminRemoveShopFromLogisticsAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'accountId': ParamValue,'shopId': ParamValue} }
    'adminSetLogisticsAccountStatus': { paramsTuple: [ParamValue]; params: {'accountId': ParamValue} }
    'adminSetShopLogisticsEnabled': { paramsTuple: [ParamValue]; params: {'shopId': ParamValue} }
    'adminListLogisticsBranches': { paramsTuple?: []; params?: {} }
    'adminSyncLogisticsBranches': { paramsTuple?: []; params?: {} }
    'adminUpdateLogisticsBranch': { paramsTuple: [ParamValue]; params: {'branchId': ParamValue} }
    'adminListCourierBookings': { paramsTuple?: []; params?: {} }
    'adminResolveCourierBooking': { paramsTuple: [ParamValue]; params: {'shopOrderNumber': ParamValue} }
    'adminRefreshCourierStatus': { paramsTuple: [ParamValue]; params: {'shopOrderNumber': ParamValue} }
    'adminListCourierEvents': { paramsTuple?: []; params?: {} }
    'adminResolveCourierEvent': { paramsTuple: [ParamValue]; params: {'courierEventId': ParamValue} }
    'adminRecordOrderVerification': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'receiveCourierCallback': { paramsTuple: [ParamValue,ParamValue]; params: {'providerCode': ParamValue,'accountId': ParamValue} }
    'home': { paramsTuple?: []; params?: {} }
    'legal.document': { paramsTuple: [ParamValue]; params: {'documentSlug': ParamValue} }
    'listing.men': { paramsTuple?: []; params?: {} }
    'listing.men.clothing': { paramsTuple?: []; params?: {} }
    'listing.men.t-shirts': { paramsTuple?: []; params?: {} }
    'listing.men.shirts': { paramsTuple?: []; params?: {} }
    'listing.men.hoodies': { paramsTuple?: []; params?: {} }
    'listing.men.jeans': { paramsTuple?: []; params?: {} }
    'listing.men.joggers': { paramsTuple?: []; params?: {} }
    'listing.men.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.men.footwear': { paramsTuple?: []; params?: {} }
    'listing.men.sneakers': { paramsTuple?: []; params?: {} }
    'listing.men.bags': { paramsTuple?: []; params?: {} }
    'listing.men.watches': { paramsTuple?: []; params?: {} }
    'listing.men.accessories': { paramsTuple?: []; params?: {} }
    'listing.women': { paramsTuple?: []; params?: {} }
    'listing.women.clothing': { paramsTuple?: []; params?: {} }
    'listing.women.tops': { paramsTuple?: []; params?: {} }
    'listing.women.dresses': { paramsTuple?: []; params?: {} }
    'listing.women.jeans': { paramsTuple?: []; params?: {} }
    'listing.women.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.women.sarees': { paramsTuple?: []; params?: {} }
    'listing.women.kurtas': { paramsTuple?: []; params?: {} }
    'listing.women.footwear': { paramsTuple?: []; params?: {} }
    'listing.women.sneakers': { paramsTuple?: []; params?: {} }
    'listing.women.bags': { paramsTuple?: []; params?: {} }
    'listing.women.watches': { paramsTuple?: []; params?: {} }
    'listing.women.accessories': { paramsTuple?: []; params?: {} }
    'listing.category': { paramsTuple: [ParamValue]; params: {'categorySlug': ParamValue} }
    'listing.search': { paramsTuple?: []; params?: {} }
    'product.show': { paramsTuple: [ParamValue]; params: {'segment': ParamValue} }
    'login': { paramsTuple?: []; params?: {} }
    'signup': { paramsTuple?: []; params?: {} }
    'verify_email': { paramsTuple?: []; params?: {} }
    'forgot_password': { paramsTuple?: []; params?: {} }
    'reset_password': { paramsTuple?: []; params?: {} }
    'mfa': { paramsTuple?: []; params?: {} }
    'account.overview': { paramsTuple?: []; params?: {} }
    'account.addresses': { paramsTuple?: []; params?: {} }
    'account.security': { paramsTuple?: []; params?: {} }
    'seller.overview': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.settings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.shipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.new': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'seller.inventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.inventory.history': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'admin.logistics': { paramsTuple?: []; params?: {} }
    'dev.design_system': { paramsTuple?: []; params?: {} }
    'dev.overlays': { paramsTuple?: []; params?: {} }
    'dev.sign_in': { paramsTuple?: []; params?: {} }
    'dev.sign_in.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'dev.sign_out': { paramsTuple?: []; params?: {} }
  }
  GET: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'getMe': { paramsTuple?: []; params?: {} }
    'listProvinces': { paramsTuple?: []; params?: {} }
    'listDistricts': { paramsTuple?: []; params?: {} }
    'listLocalLevels': { paramsTuple?: []; params?: {} }
    'listCategories': { paramsTuple?: []; params?: {} }
    'listAttributes': { paramsTuple?: []; params?: {} }
    'listProducts': { paramsTuple?: []; params?: {} }
    'getProduct': { paramsTuple: [ParamValue]; params: {'publicId': ParamValue} }
    'listAddresses': { paramsTuple?: []; params?: {} }
    'listMyShops': { paramsTuple?: []; params?: {} }
    'getSellerShop': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopShipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'listShopProducts': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'listInventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getLogisticsSettings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getCourierBookingOptions': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'adminListLogisticsAccounts': { paramsTuple?: []; params?: {} }
    'adminListLogisticsBranches': { paramsTuple?: []; params?: {} }
    'adminListCourierBookings': { paramsTuple?: []; params?: {} }
    'adminListCourierEvents': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'legal.document': { paramsTuple: [ParamValue]; params: {'documentSlug': ParamValue} }
    'listing.men': { paramsTuple?: []; params?: {} }
    'listing.men.clothing': { paramsTuple?: []; params?: {} }
    'listing.men.t-shirts': { paramsTuple?: []; params?: {} }
    'listing.men.shirts': { paramsTuple?: []; params?: {} }
    'listing.men.hoodies': { paramsTuple?: []; params?: {} }
    'listing.men.jeans': { paramsTuple?: []; params?: {} }
    'listing.men.joggers': { paramsTuple?: []; params?: {} }
    'listing.men.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.men.footwear': { paramsTuple?: []; params?: {} }
    'listing.men.sneakers': { paramsTuple?: []; params?: {} }
    'listing.men.bags': { paramsTuple?: []; params?: {} }
    'listing.men.watches': { paramsTuple?: []; params?: {} }
    'listing.men.accessories': { paramsTuple?: []; params?: {} }
    'listing.women': { paramsTuple?: []; params?: {} }
    'listing.women.clothing': { paramsTuple?: []; params?: {} }
    'listing.women.tops': { paramsTuple?: []; params?: {} }
    'listing.women.dresses': { paramsTuple?: []; params?: {} }
    'listing.women.jeans': { paramsTuple?: []; params?: {} }
    'listing.women.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.women.sarees': { paramsTuple?: []; params?: {} }
    'listing.women.kurtas': { paramsTuple?: []; params?: {} }
    'listing.women.footwear': { paramsTuple?: []; params?: {} }
    'listing.women.sneakers': { paramsTuple?: []; params?: {} }
    'listing.women.bags': { paramsTuple?: []; params?: {} }
    'listing.women.watches': { paramsTuple?: []; params?: {} }
    'listing.women.accessories': { paramsTuple?: []; params?: {} }
    'listing.category': { paramsTuple: [ParamValue]; params: {'categorySlug': ParamValue} }
    'listing.search': { paramsTuple?: []; params?: {} }
    'product.show': { paramsTuple: [ParamValue]; params: {'segment': ParamValue} }
    'login': { paramsTuple?: []; params?: {} }
    'signup': { paramsTuple?: []; params?: {} }
    'verify_email': { paramsTuple?: []; params?: {} }
    'forgot_password': { paramsTuple?: []; params?: {} }
    'reset_password': { paramsTuple?: []; params?: {} }
    'mfa': { paramsTuple?: []; params?: {} }
    'account.overview': { paramsTuple?: []; params?: {} }
    'account.addresses': { paramsTuple?: []; params?: {} }
    'account.security': { paramsTuple?: []; params?: {} }
    'seller.overview': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.settings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.shipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.new': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'seller.inventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.inventory.history': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'admin.logistics': { paramsTuple?: []; params?: {} }
    'dev.design_system': { paramsTuple?: []; params?: {} }
    'dev.overlays': { paramsTuple?: []; params?: {} }
    'dev.sign_in': { paramsTuple?: []; params?: {} }
  }
  HEAD: {
    'drive.fs.serve': { paramsTuple: [...ParamValue[]]; params: {'*': ParamValue[]} }
    'getMe': { paramsTuple?: []; params?: {} }
    'listProvinces': { paramsTuple?: []; params?: {} }
    'listDistricts': { paramsTuple?: []; params?: {} }
    'listLocalLevels': { paramsTuple?: []; params?: {} }
    'listCategories': { paramsTuple?: []; params?: {} }
    'listAttributes': { paramsTuple?: []; params?: {} }
    'listProducts': { paramsTuple?: []; params?: {} }
    'getProduct': { paramsTuple: [ParamValue]; params: {'publicId': ParamValue} }
    'listAddresses': { paramsTuple?: []; params?: {} }
    'listMyShops': { paramsTuple?: []; params?: {} }
    'getSellerShop': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopShipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'listShopProducts': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getShopProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'listInventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getLogisticsSettings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'getCourierBookingOptions': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'adminListLogisticsAccounts': { paramsTuple?: []; params?: {} }
    'adminListLogisticsBranches': { paramsTuple?: []; params?: {} }
    'adminListCourierBookings': { paramsTuple?: []; params?: {} }
    'adminListCourierEvents': { paramsTuple?: []; params?: {} }
    'home': { paramsTuple?: []; params?: {} }
    'legal.document': { paramsTuple: [ParamValue]; params: {'documentSlug': ParamValue} }
    'listing.men': { paramsTuple?: []; params?: {} }
    'listing.men.clothing': { paramsTuple?: []; params?: {} }
    'listing.men.t-shirts': { paramsTuple?: []; params?: {} }
    'listing.men.shirts': { paramsTuple?: []; params?: {} }
    'listing.men.hoodies': { paramsTuple?: []; params?: {} }
    'listing.men.jeans': { paramsTuple?: []; params?: {} }
    'listing.men.joggers': { paramsTuple?: []; params?: {} }
    'listing.men.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.men.footwear': { paramsTuple?: []; params?: {} }
    'listing.men.sneakers': { paramsTuple?: []; params?: {} }
    'listing.men.bags': { paramsTuple?: []; params?: {} }
    'listing.men.watches': { paramsTuple?: []; params?: {} }
    'listing.men.accessories': { paramsTuple?: []; params?: {} }
    'listing.women': { paramsTuple?: []; params?: {} }
    'listing.women.clothing': { paramsTuple?: []; params?: {} }
    'listing.women.tops': { paramsTuple?: []; params?: {} }
    'listing.women.dresses': { paramsTuple?: []; params?: {} }
    'listing.women.jeans': { paramsTuple?: []; params?: {} }
    'listing.women.traditional-wear': { paramsTuple?: []; params?: {} }
    'listing.women.sarees': { paramsTuple?: []; params?: {} }
    'listing.women.kurtas': { paramsTuple?: []; params?: {} }
    'listing.women.footwear': { paramsTuple?: []; params?: {} }
    'listing.women.sneakers': { paramsTuple?: []; params?: {} }
    'listing.women.bags': { paramsTuple?: []; params?: {} }
    'listing.women.watches': { paramsTuple?: []; params?: {} }
    'listing.women.accessories': { paramsTuple?: []; params?: {} }
    'listing.category': { paramsTuple: [ParamValue]; params: {'categorySlug': ParamValue} }
    'listing.search': { paramsTuple?: []; params?: {} }
    'product.show': { paramsTuple: [ParamValue]; params: {'segment': ParamValue} }
    'login': { paramsTuple?: []; params?: {} }
    'signup': { paramsTuple?: []; params?: {} }
    'verify_email': { paramsTuple?: []; params?: {} }
    'forgot_password': { paramsTuple?: []; params?: {} }
    'reset_password': { paramsTuple?: []; params?: {} }
    'mfa': { paramsTuple?: []; params?: {} }
    'account.overview': { paramsTuple?: []; params?: {} }
    'account.addresses': { paramsTuple?: []; params?: {} }
    'account.security': { paramsTuple?: []; params?: {} }
    'seller.overview': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.settings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.shipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.new': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.products.edit': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'seller.inventory': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'seller.inventory.history': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'admin.logistics': { paramsTuple?: []; params?: {} }
    'dev.design_system': { paramsTuple?: []; params?: {} }
    'dev.overlays': { paramsTuple?: []; params?: {} }
    'dev.sign_in': { paramsTuple?: []; params?: {} }
  }
  POST: {
    'signUp': { paramsTuple?: []; params?: {} }
    'logIn': { paramsTuple?: []; params?: {} }
    'verifyMfaChallenge': { paramsTuple?: []; params?: {} }
    'resendEmailVerification': { paramsTuple?: []; params?: {} }
    'confirmEmail': { paramsTuple?: []; params?: {} }
    'requestPasswordReset': { paramsTuple?: []; params?: {} }
    'resetPassword': { paramsTuple?: []; params?: {} }
    'requestAccountDeletion': { paramsTuple?: []; params?: {} }
    'changePassword': { paramsTuple?: []; params?: {} }
    'revokeAllSessions': { paramsTuple?: []; params?: {} }
    'startTotpEnrollment': { paramsTuple?: []; params?: {} }
    'confirmTotpEnrollment': { paramsTuple?: []; params?: {} }
    'createAddress': { paramsTuple?: []; params?: {} }
    'createProduct': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'publishProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'unpublishProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'archiveProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'restoreProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'adjustInventory': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'stocktakeInventory': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'variantId': ParamValue} }
    'createMediaUpload': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'completeMediaUpload': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'mediaAssetId': ParamValue} }
    'createShopCourierAccount': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'rekeyShopCourierAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'accountId': ParamValue} }
    'disableShopCourierAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'accountId': ParamValue} }
    'createPickupAddress': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'bookCourierShipment': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'cancelCourierBooking': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'shopOrderNumber': ParamValue} }
    'adminCreateLogisticsAccount': { paramsTuple?: []; params?: {} }
    'adminRekeyLogisticsAccount': { paramsTuple: [ParamValue]; params: {'accountId': ParamValue} }
    'adminSetLogisticsAccountStatus': { paramsTuple: [ParamValue]; params: {'accountId': ParamValue} }
    'adminSyncLogisticsBranches': { paramsTuple?: []; params?: {} }
    'adminResolveCourierBooking': { paramsTuple: [ParamValue]; params: {'shopOrderNumber': ParamValue} }
    'adminRefreshCourierStatus': { paramsTuple: [ParamValue]; params: {'shopOrderNumber': ParamValue} }
    'adminResolveCourierEvent': { paramsTuple: [ParamValue]; params: {'courierEventId': ParamValue} }
    'adminRecordOrderVerification': { paramsTuple: [ParamValue]; params: {'orderNumber': ParamValue} }
    'receiveCourierCallback': { paramsTuple: [ParamValue,ParamValue]; params: {'providerCode': ParamValue,'accountId': ParamValue} }
    'dev.sign_in.store': { paramsTuple: [ParamValue]; params: {'id': ParamValue} }
    'dev.sign_out': { paramsTuple?: []; params?: {} }
  }
  DELETE: {
    'logOut': { paramsTuple?: []; params?: {} }
    'deleteAddress': { paramsTuple: [ParamValue]; params: {'addressId': ParamValue} }
    'archivePickupAddress': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'addressId': ParamValue} }
    'adminRemoveShopFromLogisticsAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'accountId': ParamValue,'shopId': ParamValue} }
  }
  PATCH: {
    'updateMe': { paramsTuple?: []; params?: {} }
    'updateAddress': { paramsTuple: [ParamValue]; params: {'addressId': ParamValue} }
    'updateShopProfile': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'updateProduct': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'updatePickupAddress': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'addressId': ParamValue} }
    'adminUpdateLogisticsBranch': { paramsTuple: [ParamValue]; params: {'branchId': ParamValue} }
  }
  PUT: {
    'replaceShopShipping': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'replaceProductVariants': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'replaceProductMedia': { paramsTuple: [ParamValue,ParamValue]; params: {'shopSlug': ParamValue,'productId': ParamValue} }
    'replaceLogisticsSettings': { paramsTuple: [ParamValue]; params: {'shopSlug': ParamValue} }
    'adminAllowShopOnLogisticsAccount': { paramsTuple: [ParamValue,ParamValue]; params: {'accountId': ParamValue,'shopId': ParamValue} }
    'adminSetShopLogisticsEnabled': { paramsTuple: [ParamValue]; params: {'shopId': ParamValue} }
  }
}
declare module '@adonisjs/core/types/http' {
  export interface RoutesList extends ScannedRoutes {}
}