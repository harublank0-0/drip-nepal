/*
 * The payloads of the queues the `notifications` module hosts (docs/03 §9,
 * docs/09 §2.3 rule 4). Senders reach them by name through `sendJob`;
 * nothing imports this module. `sendJob` adds the envelope every payload
 * carries, `request_id` and `causation_id` (`JobEnvelope`, docs/09 §7.4
 * item 5), so the types here list only the queue's own keys.
 */

/*
 * A single-use token of `user_tokens` was issued and must be emailed
 * (proposed event name). The payload carries the row ID and the raw token
 * encrypted with the application `encryption` service for the purpose
 * `email_token:<purpose>` and the token's own lifetime, never the raw
 * token or the address (docs/07 §3.8 rules 1 and 2). The handler reads the
 * purpose and the recipient from the row. Its event ID is the row ID.
 */
export type UserTokenIssued = {
  event: 'user_token.issued'
  user_token_id: string
  token_enc: string
}

/*
 * Someone signed up with an email that already has an account, whose
 * holder gets the "account already exists" email instead of a verification
 * email (AC-FR-IAM-001-2; M1 part 2a). The event has no row of its own, so
 * `signUp` gives it a random `event_id`, which the delivery row's
 * `dedupe_key` names: a replayed job sends nothing new. The payload carries
 * the account's ID only; the handlers read the address when they run.
 */
export type SignupAttempted = {
  event: 'user.signup_attempted'
  event_id: string
  user_id: string
}

/*
 * The password of an account was changed, by `resetPassword` or
 * `changePassword` (AC-J18-06, AC-FR-IAM-004-4, AC-FR-IAM-005-4; M1 part
 * 4): the holder gets the "your password was changed" email, with a link to
 * reset it if the change was not theirs. Like `user.signup_attempted`, the
 * event has no row of its own, so the sender gives it a random `event_id`
 * for the delivery row's `dedupe_key`, and the payload carries the
 * account's ID only.
 */
export type PasswordChanged = {
  event: 'user.password_changed'
  event_id: string
  user_id: string
}

/*
 * The sessions of an account were signed out, by `revokeAllSessions` ("sign
 * out of all devices") or by the `reauth` lockout, the 10th wrong password
 * re-entry in 24 h (01 AC-FR-NOT-001-1 "sessions revoked"; M1 part 4): the
 * holder learns of it even when someone else did it with a stolen session,
 * with a link to reset the password. A random `event_id`, as for the other
 * notices; the payload carries the account's ID only.
 */
export type SessionsRevoked = {
  event: 'user.sessions_revoked'
  event_id: string
  user_id: string
}

/*
 * Two-step verification was turned on for a staff account, by
 * `confirmTotpEnrollment` (docs/07 §3.9; M1 part 5): the holder learns of
 * it, with a link to reset the password if it was not them. Its `event_id`
 * is the consumed `mfa_enrollment` token's row ID, so one enrolment window
 * gives at most one email; the payload carries the account's ID only.
 */
export type MfaEnabled = {
  event: 'user.mfa_enabled'
  event_id: string
  user_id: string
}

// The events about an account that carry no token, each with its own template.
export type AccountNotice = SignupAttempted | PasswordChanged | SessionsRevoked | MfaEnabled

// The events `notifications.dispatch` turns into emails.
export type NotificationEvent = UserTokenIssued | AccountNotice

/*
 * One `notification_deliveries` row to send (docs/04a §14.3): the row's ID
 * and the event it was dispatched for. The body is never stored, so
 * `notifications.send_email` renders it again from the event; for a token
 * email that means `token_enc`, which is why this queue keeps the token
 * retention of docs/07 §3.8 rule 2 too.
 */
export type SendEmail = NotificationEvent & { delivery_id: string }

declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'notifications.dispatch': NotificationEvent
    'notifications.send_email': SendEmail
  }
}
