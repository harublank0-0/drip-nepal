/*
 * `shop_addresses.purpose` (docs/04a §6.6): the values of
 * `shop_addresses_purpose_check`, in its order. T-ARCH-011 fails if the two
 * differ (docs/04 §2.4).
 */
export const SHOP_ADDRESS_PURPOSES = ['pickup', 'return'] as const
export type ShopAddressPurpose = (typeof SHOP_ADDRESS_PURPOSES)[number]
