import { DomainError } from '#exceptions/domain_error'
import { bodyTotpCheck, type MfaAttemptContext } from '#modules/identity/actions/body_totp_check'
import type { AuditFlags, OwnShopCheck } from '#modules/platform/own_shop'
import { settingIn } from '#modules/platform/settings'
import { shopsWorkedIn } from '#modules/shops/queries'

/*
 * OD-44's own-shop check for one admin request (docs/07 §4.1 item 4, §4.5,
 * §4.7; decided 2026-11-23, option (b) with the `single_operator_mode`
 * exception; R1-S part 1c-ii). A platform action on a shop the staff member
 * owns or works in, or on its orders:
 *
 * 1. answers 403 `FORBIDDEN` while `single_operator_mode` is `false`
 *    (A-20), read in the action's transaction;
 * 2. under the mode, needs a `totp_code` in the body, checked and spent in
 *    the action's transaction (`bodyTotpCheck`): none is 422 on
 *    `totp_code` (`required`), a wrong or replayed one 422 on `totp_code`
 *    (`code_incorrect`), counted by the `mfa_user` and `mfa` limiters;
 * 3. then returns the `single_operator` flag for the action's audit row.
 *
 * On any other shop the action goes ahead unflagged. `stepUpByCode` is set
 * by the controller of a step-up operation whose session is past the
 * 15-minute window but whose body carries `totp_code` (07 §3.10: a valid
 * code satisfies the step-up), so the code is checked on any shop.
 * A request whose idempotency key is replayed never reaches the action, so
 * it checks no code (06 §7.3).
 */

const OWN_SHOP_REFUSED =
  'You own or work in this shop. Platform staff cannot act on their own shop while single-operator mode is off.'
const OWN_SHOP_CODE =
  'You own or work in this shop. Enter a code from your authenticator app to act on it under single-operator mode.'

const SINGLE_OPERATOR: AuditFlags = { flags: ['single_operator'] }
const UNFLAGGED: AuditFlags = {}

export function ownShopCheck(input: {
  userId: string
  totpCode: string | undefined
  stepUpByCode: boolean
  context: MfaAttemptContext
}) {
  const totp = bodyTotpCheck(input.userId, input.totpCode, input.context, OWN_SHOP_CODE)
  const check: OwnShopCheck = async (trx, shopIds) => {
    const ids = [...new Set(shopIds.filter((id): id is string => id !== null))]
    const own = await shopsWorkedIn(trx, input.userId, ids)
    if (own.length === 0) {
      if (input.stepUpByCode) await totp.verify(trx)
      return UNFLAGGED
    }
    if ((await settingIn(trx, 'single_operator_mode', false)) !== true) {
      throw new DomainError('FORBIDDEN', { detail: OWN_SHOP_REFUSED })
    }
    await totp.verify(trx)
    return SINGLE_OPERATOR
  }
  return {
    check,
    run: <T>(work: () => Promise<T>) => totp.run(work),
    get codeVerified() {
      return totp.verified
    },
  }
}
