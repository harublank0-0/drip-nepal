import type { DevSignInAccount } from '#modules/identity/queries'

/*
 * An account the development-only sign-in offers (docs/07 §3.13): enough to
 * choose one, nothing more.
 */
export function devSignInAccountJson(account: DevSignInAccount) {
  return {
    id: account.id,
    email: account.email,
    full_name: account.fullName,
    staff_role: account.staffRole,
  }
}
