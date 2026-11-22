/*
 * The payloads of the queues the `identity` module hosts (docs/03 §9,
 * docs/09 §2.3 rule 4). Senders reach them by name through `sendJob`;
 * `sendJob` adds the envelope every payload carries, `request_id` and
 * `causation_id` (`JobEnvelope`, docs/09 §7.4 item 5).
 */

/*
 * `identity.revoke_sessions` (docs/03 §9, docs/07 §3.3; M1 part 4): the
 * user whose sessions may hold an old `security_stamp`. The user ID only,
 * never a session ID, which together with `APP_KEY` is a usable session
 * cookie (TM-30, ADR-0005 decision 4). The handler reads the stamp when it
 * runs, so a replay or a redrive destroys nothing more.
 */
export type RevokeSessions = { user_id: string }

declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'identity.revoke_sessions': RevokeSessions
  }
}
