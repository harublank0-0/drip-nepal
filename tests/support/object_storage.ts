import app from '@adonisjs/core/services/app'
import type { CallContext } from '#modules/platform/ports/call_context'
import {
  ObjectStorage,
  type PresignedUpload,
  type StorageBucket,
  type StoredObject,
} from '#modules/platform/ports/object_storage'
import { PortAdapter } from '#modules/platform/ports/port_adapter'

/*
 * The in-memory `ObjectStorage` of docs/03 §11.1 and docs/10 §3.6: it keeps
 * objects in a map instead of a bucket, so a test uploads with `put` as the
 * browser would PUT to the presigned URL, and asserts what was presigned,
 * read and deleted. Like the real adapter it extends `PortAdapter`, so a
 * call inside a `withTx` transaction throws (T-ARCH-003). `failNext` makes
 * the next calls throw, as an outage would.
 *
 *   const storage = fakeObjectStorage()   // in group.each.setup, returning storage.restore
 *   storage.fake.put('private', key, 2048, 'image/jpeg')
 */
type Stored = { bytes: number; contentType: string | null; etag: string }

export class MemoryObjectStorage extends PortAdapter implements ObjectStorage {
  protected readonly adapterName = 'MemoryObjectStorage'
  readonly objects = new Map<string, Stored>()
  readonly presigned: {
    bucket: StorageBucket
    key: string
    contentType: string
    expiresInSeconds: number
  }[] = []
  readonly deleted: string[] = []
  readonly contexts: CallContext[] = []
  #failures: Error[] = []
  #version = 0

  failNext(error: Error, times = 1) {
    for (let n = 0; n < times; n++) this.#failures.push(error)
    return this
  }

  // What the browser's PUT to the presigned URL leaves in the bucket; a new ETag each time.
  put(bucket: StorageBucket, key: string, bytes: number, contentType: string | null) {
    this.#version += 1
    this.objects.set(`${bucket}/${key}`, { bytes, contentType, etag: `"etag-${this.#version}"` })
  }

  has(bucket: StorageBucket, key: string) {
    return this.objects.has(`${bucket}/${key}`)
  }

  #call(ctx: CallContext) {
    this.contexts.push(ctx)
    const failure = this.#failures.shift()
    if (failure) throw failure
  }

  async presignUpload(
    bucket: StorageBucket,
    key: string,
    options: { contentType: string; expiresInSeconds: number },
    ctx: CallContext
  ): Promise<PresignedUpload> {
    this.guard('presignUpload')
    this.#call(ctx)
    this.presigned.push({ bucket, key, ...options })
    return {
      url: `https://storage.test/${bucket}/${key}?X-Amz-Expires=${options.expiresInSeconds}`,
      headers: { 'Content-Type': options.contentType },
    }
  }

  async head(bucket: StorageBucket, key: string, ctx: CallContext): Promise<StoredObject | null> {
    this.guard('head')
    this.#call(ctx)
    return this.objects.get(`${bucket}/${key}`) ?? null
  }

  async delete(bucket: StorageBucket, key: string, ctx: CallContext): Promise<void> {
    this.guard('delete')
    this.#call(ctx)
    this.deleted.push(`${bucket}/${key}`)
    this.objects.delete(`${bucket}/${key}`)
  }
}

// Binds a fresh in-memory store to the `ObjectStorage` port; `restore` puts the real binding back.
export function fakeObjectStorage() {
  const fake = new MemoryObjectStorage()
  app.container.swap(ObjectStorage, () => fake)
  return { fake, restore: () => app.container.restore(ObjectStorage) }
}
