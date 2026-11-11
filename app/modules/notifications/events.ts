/*
 * The payloads of the queues the `notifications` module hosts (docs/03 §9,
 * docs/09 §2.3 rule 4). Senders reach them by name through `sendJob`;
 * nothing imports this module. The `notifications.dispatch` handler, the
 * templates and the email port come in M1 (docs/12 §5.1); until then a
 * dispatch job waits in its queue.
 */

/*
 * A single-use token of `user_tokens` was issued and must be emailed
 * (proposed event name). The payload carries the row ID and the raw token
 * encrypted with the application `encryption` service for the purpose
 * `email_token:<purpose>` and the token's own lifetime, never the raw
 * token or the address (docs/07 §3.8 rules 1 and 2). The handler reads the
 * purpose and the recipient from the row.
 */
export type UserTokenIssued = {
  event: 'user_token.issued'
  user_token_id: string
  token_enc: string
}

declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'notifications.dispatch': UserTokenIssued
  }
}
