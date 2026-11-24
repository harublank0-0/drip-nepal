import type { CallContext } from '#modules/platform/ports/call_context'

/*
 * The `ObjectStorage` port (docs/03 §11.1, §11.5; ADR-0013), used by the
 * media module. Two buckets (03 §3.5): `private` holds originals and is
 * reached only through presigned URLs and the worker; `public` holds the
 * derived WebP images served from the media domain. The adapter is bound in
 * the container (providers/ports_provider.ts), so tests swap in the
 * in-memory fake of tests/support/object_storage.ts without a code branch.
 * Every method refuses to run inside a transaction (T-ARCH-003). An
 * abstract class, because the container needs a runtime token.
 *
 * R1-S part 2d-i builds the calls `createMediaUpload` and
 * `completeMediaUpload` need; the worker's bounded, conditional read and
 * its writes join with `media.process_upload` (part 2d-ii).
 */
export type StorageBucket = 'private' | 'public'

export type PresignedUpload = {
  url: string
  // The headers the browser must send with its PUT; the signature binds them.
  headers: Record<string, string>
  // When the URL stops working: the signing time plus the lifetime.
  expiresAt: Date
}

export type StoredObject = {
  bytes: number
  // As stored with the object; null when the store kept none.
  contentType: string | null
  // As the store returns it, quotes included, so a later `If-Match` can send it back.
  etag: string
}

export abstract class ObjectStorage {
  /*
   * A URL the browser PUTs one object to, valid `expiresInSeconds`, with its
   * `Content-Type` bound into the signature. Signing is local, not a
   * network call (03 §7.5).
   */
  abstract presignUpload(
    bucket: StorageBucket,
    key: string,
    options: { contentType: string; expiresInSeconds: number },
    ctx: CallContext
  ): Promise<PresignedUpload>

  // The object's size, type and ETag, or null when there is no object at `key`.
  abstract head(bucket: StorageBucket, key: string, ctx: CallContext): Promise<StoredObject | null>

  // Deletes the object at `key`; deleting a missing object is not an error.
  abstract delete(bucket: StorageBucket, key: string, ctx: CallContext): Promise<void>
}
