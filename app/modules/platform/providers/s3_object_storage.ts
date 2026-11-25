import type { Readable } from 'node:stream'
import type { Logger } from '@adonisjs/core/logger'
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ProviderTimeoutError, ProviderUnavailableError } from '#exceptions/provider_errors'
import type { CallContext } from '#modules/platform/ports/call_context'
import type {
  ObjectStorage,
  PresignedUpload,
  ReadObject,
  StorageBucket,
  StoredObject,
} from '#modules/platform/ports/object_storage'
import { PortAdapter } from '#modules/platform/ports/port_adapter'

/*
 * `ObjectStorage` over any S3-compatible store (docs/03 §11.1, §11.5;
 * ADR-0013; R1-S part 2d-i), on the AWS SDK directly: the drive disks of
 * `@adonisjs/drive` sign an upload URL with `host` only, and take no abort
 * signal, so they could neither bind the type nor stop a call.
 *
 * - The client (`s3ClientFor`) is path-style, so a presigned URL's origin is
 *   the endpoint's (07 §7.3); it computes and validates checksums only when
 *   an operation requires one, so a presigned PUT carries no checksum of an
 *   empty body that a store checking it would refuse the real file against;
 *   it tries twice, with 3 s to connect. Each call is bounded by
 *   `ctx.timeoutMs` (below); the HTTP handler's `requestTimeout` is not set,
 *   since it only warns on the console unless made fatal, and fatal it
 *   would bound a whole 10 MB upload, not the time without progress.
 * - A presigned upload is signed locally at a whole second, with
 *   `content-type` among its signed headers, so the browser must send the
 *   declared type or the store answers 403 (07 TM-16); `expiresAt` is the
 *   signing time plus the lifetime, exactly.
 * - `read` sends `If-Match`: a 412 is `changed`, a 404 `missing`; a
 *   `Content-Length` above `maxBytes` is `too_large` before any byte is
 *   read, and so is a body that sends more than that, whose stream is
 *   destroyed as soon as the count passes the limit, so at most one more
 *   chunk than the limit is ever held (07 TM-15).
 * - Each call is aborted after `ctx.timeoutMs` or with `ctx.signal`, and
 *   logged once as `provider.call` (operation, bucket, outcome, duration,
 *   request ID; never a key, URL or credential). A missing object is null
 *   for `head` (logged `not_found`, which a wrong bucket name also gives)
 *   and nothing for `delete`; a timeout is `ProviderTimeout`, anything else
 *   `ProviderUnavailable`, both 503 and retried by a job (03 §10.4).
 */
export type S3Settings = {
  endpoint: string
  region: string
  accessKeyId: string
  secretAccessKey: string
}

export function s3ClientFor(
  settings: S3Settings,
  requestHandler: S3Client['config']['requestHandler'] | object = {
    connectionTimeout: 3000,
  }
) {
  return new S3Client({
    endpoint: settings.endpoint,
    region: settings.region,
    forcePathStyle: true,
    credentials: { accessKeyId: settings.accessKeyId, secretAccessKey: settings.secretAccessKey },
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    maxAttempts: 2,
    requestHandler: requestHandler as S3Client['config']['requestHandler'],
  })
}

type SdkError = { name?: string; code?: string; $metadata?: { httpStatusCode?: number } }

const isNotFound = (error: unknown) => {
  const failure = error as SdkError
  return (
    failure?.$metadata?.httpStatusCode === 404 ||
    failure?.name === 'NotFound' ||
    failure?.name === 'NoSuchKey'
  )
}

const isPreconditionFailed = (error: unknown) =>
  (error as SdkError)?.$metadata?.httpStatusCode === 412

const isTimeout = (error: unknown, signal: AbortSignal) => {
  const failure = error as SdkError
  return (
    signal.aborted ||
    failure?.name === 'TimeoutError' ||
    failure?.name === 'RequestTimeout' ||
    failure?.code === 'ETIMEDOUT'
  )
}

// What a finished call logs: `not_found` for a missing `head`, a read's outcome other than `read`, else `ok`.
const outcomeOf = (result: unknown) => {
  if (result === null) return 'not_found'
  const outcome = (result as { outcome?: string } | undefined)?.outcome
  return outcome && outcome !== 'read' ? outcome : 'ok'
}

export class S3ObjectStorage extends PortAdapter implements ObjectStorage {
  protected readonly adapterName = 'S3ObjectStorage'

  constructor(
    private readonly client: S3Client,
    private readonly buckets: Record<StorageBucket, string>,
    private readonly logger: Logger
  ) {
    super()
  }

  async presignUpload(
    bucket: StorageBucket,
    key: string,
    options: { contentType: string; expiresInSeconds: number },
    ctx: CallContext
  ): Promise<PresignedUpload> {
    this.guard('presignUpload')
    const signedAt = new Date(Math.floor(Date.now() / 1000) * 1000)
    const command = new PutObjectCommand({
      Bucket: this.buckets[bucket],
      Key: key,
      ContentType: options.contentType,
    })
    const url = await this.call('presign_upload', bucket, ctx, () =>
      getSignedUrl(this.client, command, {
        expiresIn: options.expiresInSeconds,
        signingDate: signedAt,
        signableHeaders: new Set(['content-type']),
      })
    )
    return {
      url,
      headers: { 'Content-Type': options.contentType },
      expiresAt: new Date(signedAt.getTime() + options.expiresInSeconds * 1000),
    }
  }

  async head(bucket: StorageBucket, key: string, ctx: CallContext): Promise<StoredObject | null> {
    this.guard('head')
    return this.call('head', bucket, ctx, async (abortSignal) => {
      try {
        const object = await this.client.send(
          new HeadObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
          { abortSignal }
        )
        return {
          bytes: object.ContentLength ?? 0,
          contentType: object.ContentType ?? null,
          // An object without an ETag is refused by the caller (an empty ETag cannot be stored).
          etag: object.ETag ?? '',
        }
      } catch (error) {
        if (!abortSignal.aborted && isNotFound(error)) return null
        throw error
      }
    })
  }

  async delete(bucket: StorageBucket, key: string, ctx: CallContext): Promise<void> {
    this.guard('delete')
    await this.call('delete', bucket, ctx, async (abortSignal) => {
      try {
        await this.client.send(
          new DeleteObjectCommand({ Bucket: this.buckets[bucket], Key: key }),
          { abortSignal }
        )
      } catch (error) {
        if (abortSignal.aborted || !isNotFound(error)) throw error
      }
    })
  }

  async read(
    bucket: StorageBucket,
    key: string,
    options: { ifMatch: string; maxBytes: number },
    ctx: CallContext
  ): Promise<ReadObject> {
    this.guard('read')
    return this.call('read', bucket, ctx, async (abortSignal): Promise<ReadObject> => {
      let object
      try {
        object = await this.client.send(
          new GetObjectCommand({
            Bucket: this.buckets[bucket],
            Key: key,
            IfMatch: options.ifMatch,
          }),
          { abortSignal }
        )
      } catch (error) {
        if (abortSignal.aborted) throw error
        if (isNotFound(error)) return { outcome: 'missing' }
        if (isPreconditionFailed(error)) return { outcome: 'changed' }
        throw error
      }
      const body = object.Body as Readable | undefined
      if ((object.ContentLength ?? 0) > options.maxBytes) {
        body?.destroy()
        return { outcome: 'too_large' }
      }
      const chunks: Buffer[] = []
      let total = 0
      for await (const chunk of body ?? []) {
        total += (chunk as Buffer).length
        if (total > options.maxBytes) {
          body?.destroy()
          return { outcome: 'too_large' }
        }
        chunks.push(chunk as Buffer)
      }
      return {
        outcome: 'read',
        body: Buffer.concat(chunks, total),
        contentType: object.ContentType ?? null,
        etag: object.ETag ?? '',
      }
    })
  }

  async put(
    bucket: StorageBucket,
    key: string,
    body: Buffer,
    options: { contentType: string; cacheControl?: string },
    ctx: CallContext
  ): Promise<void> {
    this.guard('put')
    await this.call('put', bucket, ctx, async (abortSignal) => {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.buckets[bucket],
          Key: key,
          Body: body,
          ContentLength: body.length,
          ContentType: options.contentType,
          CacheControl: options.cacheControl,
        }),
        { abortSignal }
      )
    })
  }

  private async call<T>(
    operation: string,
    bucket: StorageBucket,
    ctx: CallContext,
    work: (abortSignal: AbortSignal) => Promise<T>
  ): Promise<T> {
    const started = performance.now()
    const fields = (outcome: string, reason?: string) => ({
      provider: 's3',
      operation,
      bucket,
      outcome,
      ...(reason ? { reason } : {}),
      duration_ms: Math.round(performance.now() - started),
      request_id: ctx.requestId,
    })
    // A controller with an ordinary timer, cleared when the call ends, rather than
    // AbortSignal.timeout, whose timer is unreferenced and outlives the call.
    const controller = new AbortController()
    const signal = controller.signal
    const timer = setTimeout(() => controller.abort(), ctx.timeoutMs)
    const forward = () => controller.abort()
    ctx.signal?.addEventListener('abort', forward, { once: true })
    if (ctx.signal?.aborted) controller.abort()
    try {
      if (signal.aborted) throw new Error('aborted before the call')
      const result = await work(signal)
      this.logger.info(fields(outcomeOf(result)), 'provider.call')
      return result
    } catch (error) {
      if (isTimeout(error, signal)) {
        // The caller's abort is told apart in the log; both are 503 to the caller.
        this.logger.warn(
          fields('timeout', ctx.signal?.aborted ? 'aborted' : undefined),
          'provider.call'
        )
        throw new ProviderTimeoutError('s3', operation)
      }
      this.logger.warn(fields('unavailable', (error as SdkError)?.name ?? 'error'), 'provider.call')
      throw new ProviderUnavailableError('s3', operation)
    } finally {
      clearTimeout(timer)
      ctx.signal?.removeEventListener('abort', forward)
    }
  }
}

/*
 * The storage when S3_* is not set (development without a local S3 server):
 * every call fails with 503 `PROVIDER_UNAVAILABLE` and logs why, so an
 * upload never pretends to work. Staging and production cannot start
 * without the settings (start/env_policy.ts).
 */
export class UnconfiguredObjectStorage extends PortAdapter implements ObjectStorage {
  protected readonly adapterName = 'UnconfiguredObjectStorage'

  constructor(private readonly logger: Logger) {
    super()
  }

  private refuse(operation: string, ctx: CallContext): never {
    this.logger.warn(
      {
        provider: 'none',
        operation,
        outcome: 'unavailable',
        reason: 'not_configured',
        duration_ms: 0,
        request_id: ctx.requestId,
      },
      'provider.call'
    )
    throw new ProviderUnavailableError('none', operation)
  }

  async presignUpload(
    _bucket: StorageBucket,
    _key: string,
    _options: { contentType: string; expiresInSeconds: number },
    ctx: CallContext
  ): Promise<PresignedUpload> {
    this.guard('presignUpload')
    return this.refuse('presign_upload', ctx)
  }

  async head(_bucket: StorageBucket, _key: string, ctx: CallContext): Promise<StoredObject | null> {
    this.guard('head')
    return this.refuse('head', ctx)
  }

  async delete(_bucket: StorageBucket, _key: string, ctx: CallContext): Promise<void> {
    this.guard('delete')
    return this.refuse('delete', ctx)
  }

  async read(
    _bucket: StorageBucket,
    _key: string,
    _options: { ifMatch: string; maxBytes: number },
    ctx: CallContext
  ): Promise<ReadObject> {
    this.guard('read')
    return this.refuse('read', ctx)
  }

  async put(
    _bucket: StorageBucket,
    _key: string,
    _body: Buffer,
    _options: { contentType: string; cacheControl?: string },
    ctx: CallContext
  ): Promise<void> {
    this.guard('put')
    return this.refuse('put', ctx)
  }
}
