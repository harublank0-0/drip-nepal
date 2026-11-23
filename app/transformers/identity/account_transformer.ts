import type User from '#models/user'
import type { OwnAccount } from '#modules/identity/queries'
import type { UserShop } from '#modules/shops/queries'

/*
 * The signed-in user as the auth and self operations answer it (docs/06
 * §13.3). Each member is listed, so nothing secret can follow a column
 * into a response: never the password hash, the security stamp, the TOTP
 * secret, the encrypted phone or its blind index (docs/07 TM-06, §5.5).
 */

// `logIn`'s `user`: who is now signed in, as the shared `user` prop plus the status.
export function sessionUserJson(user: User) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    status: user.status,
  }
}

// `getMe`: the profile, status, consents, `phone_last4`, staff role and shops.
export function meJson(account: OwnAccount, shops: UserShop[]) {
  return {
    id: account.id,
    email: account.email,
    full_name: account.fullName,
    status: account.status,
    phone_last4: account.phoneLast4,
    marketing_email_consent: account.marketingEmailConsent,
    marketing_sms_consent: account.marketingSmsConsent,
    staff_role: account.staffRole,
    shops: shops.map((shop) => ({
      slug: shop.slug,
      name: shop.name,
      status: shop.status,
      role: shop.role,
    })),
  }
}

/*
 * The `account` prop of `/account` (docs/08 §2.4; M1 part 6a): what the
 * profile form shows and edits, nothing more (T-SEC-036). The phone is the
 * last four digits only (docs/07 §5.5); no ID, role or shop.
 */
export function profileProps(account: OwnAccount) {
  return {
    email: account.email,
    full_name: account.fullName,
    status: account.status,
    phone_last4: account.phoneLast4,
    marketing_email_consent: account.marketingEmailConsent,
    marketing_sms_consent: account.marketingSmsConsent,
  }
}
