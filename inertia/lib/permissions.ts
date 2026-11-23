import type { Data } from '@generated/data'

/*
 * What the seller pages may offer (docs/09 §13.7 rule 2, docs/08 §8.5): the
 * `current_shop` shared prop's resolved permission list, and nothing else.
 * The UI hides; the server decides, checking the permission and the shop's
 * status gate on every page and API route (T-SEC-030, T-SEC-031).
 */
export type CurrentShop = NonNullable<Data.SharedProps['current_shop']>
export type ShopPermission = CurrentShop['permissions'][number]

export function can(shop: Data.SharedProps['current_shop'], permission: ShopPermission) {
  return shop?.permissions.includes(permission) ?? false
}
