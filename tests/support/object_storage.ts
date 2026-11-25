import app from '@adonisjs/core/services/app'
import type { CallContext } from '#modules/platform/ports/call_context'
import {
  ObjectStorage,
  type PresignedUpload,
  type ReadObject,
  type StorageBucket,
  type StoredObject,
} from '#modules/platform/ports/object_storage'
import { PortAdapter } from '#modules/platform/ports/port_adapter'

/*
 * The in-memory `ObjectStorage` of docs/03 §11.1 and docs/10 §3.6: it keeps
 * objects in a map instead of a bucket, so a test uploads with `upload` as
 * the browser would PUT to the presigned URL (a size only, or real bytes for
 * the worker to read), and asserts what was presigned, read, written and
 * deleted. `read` honours `If-Match` and the size limit as the S3 adapter
 * does; `put` is the worker's write. Like the real adapter it extends `PortAdapter`, so a
 * call inside a `withTx` transaction throws (T-ARCH-003). `failNext` makes
 * the next calls throw, as an outage would, and `failNextOn` the next call
 * of one operation; `gateHeads(n)` holds each `head` until `n` of them wait,
 * so concurrent requests all pass the step before it before any goes on
 * (the concurrency suite's races), and fails after 5 s if they never do.
 *
 *   const storage = fakeObjectStorage()   // in group.each.setup, returning storage.restore
 *   storage.fake.upload('private', key, 2048, 'image/jpeg')
 *   storage.fake.upload('private', key, jpegBytes, 'image/jpeg')
 */
type Stored = {
  bytes: number
  contentType: string | null
  etag: string
  body?: Buffer
  cacheControl?: string
}

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
  readonly written: string[] = []
  readonly reads: string[] = []
  readonly contexts: CallContext[] = []
  #failures: Error[] = []
  #operationFailures = new Map<string, Error>()
  #version = 0
  #headGate: { count: number; waiting: (() => void)[] } | null = null

  gateHeads(count: number) {
    this.#headGate = { count, waiting: [] }
    return this
  }

  failNext(error: Error, times = 1) {
    for (let n = 0; n < times; n++) this.#failures.push(error)
    return this
  }

  failNextOn(operation: 'presignUpload' | 'head' | 'delete' | 'read' | 'put', error: Error) {
    this.#operationFailures.set(operation, error)
    return this
  }

  // What the browser's PUT to the presigned URL leaves in the bucket; a new ETag each time unless given.
  upload(
    bucket: StorageBucket,
    key: string,
    content: number | Buffer,
    contentType: string | null,
    etag?: string
  ) {
    this.#version += 1
    this.objects.set(`${bucket}/${key}`, {
      bytes: typeof content === 'number' ? content : content.length,
      body: typeof content === 'number' ? undefined : content,
      contentType,
      etag: etag ?? `"etag-${this.#version}"`,
    })
  }

  object(bucket: StorageBucket, key: string) {
    return this.objects.get(`${bucket}/${key}`)
  }

  has(bucket: StorageBucket, key: string) {
    return this.objects.has(`${bucket}/${key}`)
  }

  #call(operation: string, ctx: CallContext) {
    this.contexts.push(ctx)
    const failure = this.#failures.shift() ?? this.#operationFailures.get(operation)
    this.#operationFailures.delete(operation)
    if (failure) throw failure
  }

  async presignUpload(
    bucket: StorageBucket,
    key: string,
    options: { contentType: string; expiresInSeconds: number },
    ctx: CallContext
  ): Promise<PresignedUpload> {
    this.guard('presignUpload')
    this.#call('presignUpload', ctx)
    this.presigned.push({ bucket, key, ...options })
    return {
      url: `https://storage.test/${bucket}/${key}?X-Amz-Expires=${options.expiresInSeconds}`,
      headers: { 'Content-Type': options.contentType },
      expiresAt: new Date(Date.now() + options.expiresInSeconds * 1000),
    }
  }

  async head(bucket: StorageBucket, key: string, ctx: CallContext): Promise<StoredObject | null> {
    this.guard('head')
    const gate = this.#headGate
    if (gate) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`gateHeads: ${gate.waiting.length} of ${gate.count} arrived`)),
          5000
        )
        gate.waiting.push(() => {
          clearTimeout(timer)
          resolve()
        })
        if (gate.waiting.length >= gate.count) {
          this.#headGate = null
          for (const release of gate.waiting) release()
        }
      })
    }
    this.#call('head', ctx)
    return this.objects.get(`${bucket}/${key}`) ?? null
  }

  async delete(bucket: StorageBucket, key: string, ctx: CallContext): Promise<void> {
    this.guard('delete')
    this.#call('delete', ctx)
    this.deleted.push(`${bucket}/${key}`)
    this.objects.delete(`${bucket}/${key}`)
  }

  async read(
    bucket: StorageBucket,
    key: string,
    options: { ifMatch: string; maxBytes: number },
    ctx: CallContext
  ): Promise<ReadObject> {
    this.guard('read')
    this.#call('read', ctx)
    this.reads.push(`${bucket}/${key}`)
    const stored = this.objects.get(`${bucket}/${key}`)
    if (!stored) return { outcome: 'missing' }
    if (stored.etag !== options.ifMatch) return { outcome: 'changed' }
    if (stored.bytes > options.maxBytes) return { outcome: 'too_large' }
    if (!stored.body) throw new Error(`MemoryObjectStorage: ${key} was uploaded without bytes`)
    return {
      outcome: 'read',
      body: Buffer.from(stored.body),
      contentType: stored.contentType,
      etag: stored.etag,
    }
  }

  async put(
    bucket: StorageBucket,
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string },
    ctx: CallContext
  ): Promise<void> {
    this.guard('put')
    this.#call('put', ctx)
    this.#version += 1
    this.written.push(`${bucket}/${key}`)
    this.objects.set(`${bucket}/${key}`, {
      bytes: body.length,
      body: Buffer.from(body),
      contentType: options.contentType,
      cacheControl: options.cacheControl,
      etag: `"etag-${this.#version}"`,
    })
  }
}

// Binds a fresh in-memory store to the `ObjectStorage` port; `restore` puts the real binding back.
export function fakeObjectStorage() {
  const fake = new MemoryObjectStorage()
  app.container.swap(ObjectStorage, () => fake)
  return { fake, restore: () => app.container.restore(ObjectStorage) }
}
