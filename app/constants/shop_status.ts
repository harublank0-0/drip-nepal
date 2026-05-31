/**
 * Shop Status for DripNepal
 * The status can be `active`, `suspended`, `deleted`, etc
 */
export const ShopStatuses = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DELETED: 'deleted',
  PENDING: 'pending',
} as const

export type ShopStatus = (typeof ShopStatuses)[keyof typeof ShopStatuses]

export const ShopStatusValues = Object.values(ShopStatuses)
