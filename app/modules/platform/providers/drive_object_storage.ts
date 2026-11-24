import type { Logger } from '@adonisjs/core/logger'
import { PutObjectCommand, type S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ProviderTimeoutError, ProviderUnavailableError } from '#exceptions/provider_errors'
import type { CallContext } from '#modules/platform/ports/call_context'
import {
  type ObjectStorage,
  type PresignedUpload,
  type StorageBucket,
  type StoredObject,
} from '#modules/platform/ports/object_storage'
import { PortAdapter } from '#modules/platform/ports/port_adapter'

/*
 * `ObjectStorage` over the `private` and `public` drive disks of
 * config/drive.ts (ADR-0013 decision 7; R1-S part 2d-i): S3-compatible,
 * path-style, one client per process. The presigned upload is signed with
 * the SDK's presigner directly, because the drive's signed upload URL
 * signs only `host`: here `content-type` is a signed header too, so the
 * browser's PUT must send the declared type or the store answers 403
 * (07 TM-16). Each call is logged once as
 * `provider.call` (operation, bucket, outcome, duration, request ID; never
 * a key or a URL, which carry signatures). A missing object is `null` for
 * `head` and nothing for `delete`; anything else that fails is 503
 * `PROVIDER_UNAVAILABLE` (a timeout too, since its outcome is unknown) and
 * is retried by a job (docs/03 §10.4). The call also gives up after
 * `ctx.timeoutMs`, whatever the client's own time limits.
 */
export type StorageDriver = {
  getMetaData(key: string): Promise<{ contentType?: string; contentLength: number; etag: string }>
  delete(key: string): Promise<void>
}

type SdkError = { name?: string; code?: string; $metadata?: { httpStatusCode?: number } }

const isNotFound = (error: unknown) => {
  const failure = error as SdkError
  return failure?.$metadata?.httpStatusCode === 404 || failure?.name === 'NotFound'
}

const isTimeout = (error: unknown) => {
  const failure = error as SdkError
  return (
    failure?.name === 'TimeoutError' ||
    failure?.name === 'RequestTimeout' ||
    failure?.code === 'ETIMEDOUT'
  )
}

class DeadlinePassed extends Error {}

export class DriveObjectStorage extends PortAdapter implements ObjectStorage {
  protected readonly adapterName = 'DriveObjectStorage'

  constructor(
    private readonly disks: Record<StorageBucket, { driver: StorageDriver; bucket: string }>,
    private readonly client: S3Client,
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
    const command = new PutObjectCommand({
      Bucket: this.disks[bucket].bucket,
      Key: key,
      ContentType: options.contentType,
    })
    const url = await this.call('presign_upload', bucket, ctx, () =>
      getSignedUrl(this.client, command, {
        expiresIn: options.expiresInSeconds,
        signableHeaders: new Set(['content-type']),
      })
    )
    return { url, headers: { 'Content-Type': options.contentType } }
  }

  async head(bucket: StorageBucket, key: string, ctx: CallContext): Promise<StoredObject | null> {
    this.guard('head')
    return this.call('head', bucket, ctx, async () => {
      try {
        const meta = await this.disks[bucket].driver.getMetaData(key)
        return { bytes: meta.contentLength, contentType: meta.contentType ?? null, etag: meta.etag }
      } catch (error) {
        if (isNotFound(error)) return null
        throw error
      }
    })
  }

  async delete(bucket: StorageBucket, key: string, ctx: CallContext): Promise<void> {
    this.guard('delete')
    await this.call('delete', bucket, ctx, async () => {
      try {
        await this.disks[bucket].driver.delete(key)
      } catch (error) {
        if (!isNotFound(error)) throw error
      }
    })
  }

  private async call<T>(
    operation: string,
    bucket: StorageBucket,
    ctx: CallContext,
    work: () => Promise<T>
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
    if (ctx.signal?.aborted) {
      this.logger.warn(fields('unavailable', 'aborted'), 'provider.call')
      throw new ProviderUnavailableError('s3', operation)
    }
    let timer: NodeJS.Timeout | undefined
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new DeadlinePassed()), ctx.timeoutMs)
    })
    try {
      const result = await Promise.race([work(), deadline])
      this.logger.info(fields('ok'), 'provider.call')
      return result
    } catch (error) {
      if (error instanceof DeadlinePassed || isTimeout(error)) {
        this.logger.warn(fields('timeout'), 'provider.call')
        throw new ProviderTimeoutError('s3', operation)
      }
      this.logger.warn(fields('unavailable', (error as SdkError)?.name ?? 'error'), 'provider.call')
      throw new ProviderUnavailableError('s3', operation)
    } finally {
      clearTimeout(timer)
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
}
