/*
 * The queues the `media` module hosts (docs/03 §9; payloads carry
 * identifiers only, docs/04a §15.5). Senders reach them by name through
 * `sendJob`.
 *
 * - `media.process_upload`: validates one uploaded original and writes its
 *   derivatives (ADR-0013 decision 3; `jobs/process_upload.ts`). Sent by
 *   `completeMediaUpload` in the transaction that moves the asset to
 *   `processing`; the worker runs one at a time.
 * - `media.cleanup_abandoned`: daily, deletes the objects of uploads never
 *   finished or rejected more than 24 hours ago (ADR-0013 decision 6;
 *   `jobs/cleanup_abandoned.ts`).
 */
declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'media.process_upload': { media_asset_id: string }
    'media.cleanup_abandoned': Record<string, never>
  }
}

export {}
