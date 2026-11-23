/*
 * Whether a shop's `shop.member` routes, the overview first, open for the
 * caller: the status gate of docs/07 §4.4 for those routes (proposed,
 * OD-48). Open while the shop is `active` or `suspended` (either mode), to
 * the owner only while it is `pending_review` or `rejected`, and never once
 * it is `closed`. The server's gate (`shopGateAllows` in
 * app/modules/shops/permissions.ts) and the links of the seller UI (the
 * public header's "Your shop", the shop switcher) use this one rule, so the
 * UI never links to a page that answers 403. `role` is `owner` or the
 * member's role.
 */
export function memberRoutesOpen(status: string, role: string) {
  if (status === 'active' || status === 'suspended') return true
  return (status === 'pending_review' || status === 'rejected') && role === 'owner'
}

/*
 * Whether the shop's profile may be changed (`updateShopProfile`): the
 * "profile, shipping" column of docs/07 §4.4. Open while the shop is
 * `active`, to the owner only while it is `pending_review` or `rejected`,
 * and never while it is `suspended` (either mode) or `closed`. The
 * permission (`shop.profile.manage`) is checked besides. The server's gate
 * (`shopGateAllows(shop, 'profile')`) and the settings page, which shows the
 * form or the read-only profile, use this one rule (R1-S part 1b).
 */
export function profileEditable(status: string, role: string) {
  if (status === 'active') return true
  return (status === 'pending_review' || status === 'rejected') && role === 'owner'
}
