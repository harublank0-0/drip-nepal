/**
 * Shop Status for DripNepal
 * The status can be `active`, `suspended`, `deleted`, etc
 */
export const ShopStatus = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
  PENDING: 'pending',
  CLOSED: 'closed',
} as const

export type ShopStatus = (typeof ShopStatus)[keyof typeof ShopStatus]

export const ShopStatusValues = Object.values(ShopStatus)
