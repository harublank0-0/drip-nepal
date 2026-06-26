export const ShopAddressTypes = {
  PRIMARY: 'primary',
  WAREHOUSE: 'warehouse',
  PICKUP: 'pickup',
  RETURN: 'return',
} as const

export type ShopAddressType = (typeof ShopAddressTypes)[keyof typeof ShopAddressTypes]

export const ShopAddressTypeValues = Object.values(ShopAddressTypes)
