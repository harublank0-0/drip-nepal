/*
 * The `detail` of `logIn`'s one 401 for a wrong password or an unknown
 * email (docs/06 §13.3, AC-FR-IAM-003-2). The sign-in form tells it apart
 * from the account check's 401 ("Please log in to continue.", docs/07
 * §3.3), which a stale session cookie gets on the same request: that one
 * ended the old session, so the form reloads the page and sends the sign-in
 * again instead of saying the password is wrong.
 */
export const INVALID_CREDENTIALS_DETAIL = 'Invalid email or password.'
