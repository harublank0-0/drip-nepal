/*
 * The `detail` of `logIn`'s one 401 for a wrong password or an unknown
 * email (docs/06 §13.3, AC-FR-IAM-003-2). The sign-in form tells it apart
 * from the account check's 401 ("Please log in to continue.", docs/07
 * §3.3), which a stale session cookie gets on the same request: that one
 * ended the old session, so the form reloads the page and sends the sign-in
 * again instead of saying the password is wrong.
 */
export const INVALID_CREDENTIALS_DETAIL = 'Invalid email or password.'

/*
 * A TOTP code as `verifyMfaChallenge` and `confirmTotpEnrollment` take it:
 * six digits (RFC 6238, docs/07 §3.9). The `/mfa` page and the step-up
 * field send what the user typed or pasted with its spaces and hyphens
 * removed (`totpInput`), so "123 456" from an authenticator app passes.
 */
export const TOTP_CODE_PATTERN = /^\d{6}$/

export const totpInput = (value: string) => value.replace(/[\s-]/g, '')

/*
 * The `detail` of 403 `ACCOUNT_SUSPENDED` (docs/06 §5.2), which a
 * `suspended`, `deactivated` or `anonymized` account gets (01
 * AC-FR-IAM-003-4, docs/07 §3.3 row 1). One wording for all of them: since
 * M1 part 6a a user can close their own account, and someone returning to
 * reopen it is not "suspended".
 */
export const ACCOUNT_SUSPENDED_DETAIL = 'This account is suspended or closed.'
