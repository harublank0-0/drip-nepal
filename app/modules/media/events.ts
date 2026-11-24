/*
 * The queues the `media` module hosts (docs/03 §9; payloads carry
 * identifiers only, docs/04a §15.5). Senders reach them by name through
 * `sendJob`.
 *
 * - `media.process_upload`: validates one uploaded original and writes its
 *   derivatives (ADR-0013 decision 3). Sent by `completeMediaUpload` in the
 *   transaction that moves the asset to `processing`; its handler is built
 *   in R1-S part 2d-ii, so until then the job waits in its queue.
 */
declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'media.process_upload': { media_asset_id: string }
  }
}

export {}
