/*
 * The queues the `logistics` module hosts (docs/03 §9, M6; payloads carry
 * identifiers only, docs/04a §15.5). Senders reach them by name through
 * `sendJob`.
 *
 * - `logistics.verify_account`: the test call that moves an account from
 *   `pending` to `active` or `invalid` (docs/04a §9.9). `version` is the
 *   account version the job was sent for, so a job queued before a re-key
 *   never activates credentials it did not test.
 * - `logistics.sync_branches`: reads a courier's branch list (docs/04a §9.12).
 */
declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'logistics.verify_account': { account_id: string; version: number }
    'logistics.sync_branches': { provider_code: string }
  }
}

export {}
