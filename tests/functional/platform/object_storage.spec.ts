import { test } from '@japa/runner'
import { Readable } from 'node:stream'
import app from '@adonisjs/core/services/app'
import type { Logger } from '@adonisjs/core/logger'
import { S3Driver } from '@adonisjs/drive/drivers/s3'
import { S3Client } from '@aws-sdk/client-s3'
import { ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import { ProviderTimeoutError, ProviderUnavailableError } from '#exceptions/provider_errors'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import {
  DriveObjectStorage,
  UnconfiguredObjectStorage,
} from '#modules/platform/providers/drive_object_storage'
import { withTx } from '#modules/platform/tx'

/*
 * The `ObjectStorage` port and its drive adapter (docs/03 §11.1, §11.5;
 * ADR-0013; R1-S part 2d-i), over the real AWS SDK, signer and flydrive S3
 * driver, with a canned HTTP handler in place of the network (no S3 server
 * runs in CI yet, docs/12 §9 part 2d):
 *
 * - T-ARCH-003, its storage case: the bound adapter, the drive adapter and
 *   the unconfigured one throw inside a transaction;
 * - T-MED-004, the adapter part: a presigned upload is signed locally (no
 *   request), path-style on the endpoint's origin, valid 10 minutes, with
 *   `Content-Type` among the signed headers (07 TM-16); `head` maps an
 *   object to its size, type and quoted ETag and a 404 to null; `delete`
 *   ignores a missing object; any other failure is `ProviderUnavailable`,
 *   no answer within `timeoutMs` is `ProviderTimeout`; each call logs one
 *   `provider.call` line without a key or URL; with S3_* unset every call
 *   fails with `ProviderUnavailable` and logs `not_configured`.
 */

const CTX = { requestId: 'req-1', timeoutMs: 2000 }
const KEY = 'originals/01929a50-0000-7000-8000-000000000001/01929a50-0000-7000-8000-0000000000a1'

type Line = { level: string; fields: Record<string, unknown>; message: string }
type Seen = { method: string; path: string; headers: Record<string, string> }
type Canned = { statusCode: number; headers?: Record<string, string> } | 'hang'

function recordingLogger() {
  const lines: Line[] = []
  const at = (level: string) => (fields: Record<string, unknown>, message: string) =>
    lines.push({ level, fields, message })
  const logger = { info: at('info'), warn: at('warn') } as unknown as Logger
  return { lines, logger }
}

// The adapter over a real S3 client whose HTTP handler answers from `responses`.
function storageWith(responses: Canned[]) {
  const seen: Seen[] = []
  const client = new S3Client({
    endpoint: 'http://storage.test:9000',
    region: 'us-east-1',
    forcePathStyle: true,
    maxAttempts: 1,
    credentials: { accessKeyId: 'test-access-key', secretAccessKey: 'test-secret-key' },
    requestHandler: {
      handle: async (request: Seen) => {
        seen.push({ method: request.method, path: request.path, headers: request.headers })
        const next = responses.shift() ?? { statusCode: 500 }
        if (next === 'hang') return new Promise(() => {})
        return {
          response: {
            statusCode: next.statusCode,
            headers: next.headers ?? {},
            body: Readable.from([]),
          },
        }
      },
    },
  })
  const disk = (bucket: string) => ({
    driver: new S3Driver({ client, bucket, visibility: 'private', supportsACL: false }),
    bucket,
  })
  const { lines, logger } = recordingLogger()
  const storage = new DriveObjectStorage(
    { private: disk('dripnepal-test-private'), public: disk('dripnepal-test-public') },
    client,
    logger
  )
  return { storage, seen, lines }
}

const failureOf = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error) => error
  )

test.group('T-ARCH-003 storage adapters and transactions', () => {
  test('T-ARCH-003 the bound, drive and unconfigured adapters refuse to run inside a transaction', async ({
    assert,
  }) => {
    const bound = await app.container.make(ObjectStorage)
    const { storage } = storageWith([])
    const { logger } = recordingLogger()
    for (const adapter of [bound, storage, new UnconfiguredObjectStorage(logger)]) {
      const error = await failureOf(withTx(() => adapter.head('private', KEY, CTX)))
      assert.instanceOf(error, ProviderCallInsideTransaction, adapter.constructor.name)
    }
  })
})

test.group('T-MED-004 drive object storage', () => {
  test('T-MED-004 a presigned upload is signed locally, path-style, for 10 minutes, with its type bound', async ({
    assert,
  }) => {
    const { storage, seen, lines } = storageWith([])
    const upload = await storage.presignUpload(
      'private',
      KEY,
      { contentType: 'image/webp', expiresInSeconds: 600 },
      CTX
    )
    assert.lengthOf(seen, 0, 'signing makes no request')
    const url = new URL(upload.url)
    assert.equal(url.origin, 'http://storage.test:9000')
    assert.equal(url.pathname, `/dripnepal-test-private/${KEY}`)
    assert.equal(url.searchParams.get('X-Amz-Expires'), '600')
    assert.include(url.searchParams.get('X-Amz-SignedHeaders')!.split(';'), 'content-type')
    assert.isNotEmpty(url.searchParams.get('X-Amz-Signature'))
    assert.deepEqual(upload.headers, { 'Content-Type': 'image/webp' })
    assert.deepEqual(lines[0].fields, {
      provider: 's3',
      operation: 'presign_upload',
      bucket: 'private',
      outcome: 'ok',
      duration_ms: lines[0].fields.duration_ms,
      request_id: 'req-1',
    })
    assert.notInclude(JSON.stringify(lines), KEY, 'no key in the log')
  })

  test('T-MED-004 head answers size, type and the quoted ETag, or null for a missing object', async ({
    assert,
  }) => {
    const { storage, seen } = storageWith([
      {
        statusCode: 200,
        headers: {
          'content-length': '2048',
          'content-type': 'image/jpeg',
          'etag': '"9b2cf535f27731c974343645a3985328"',
          'last-modified': 'Tue, 24 Nov 2026 06:00:00 GMT',
        },
      },
      { statusCode: 404 },
    ])
    const found = await storage.head('private', KEY, CTX)
    assert.deepEqual(found, {
      bytes: 2048,
      contentType: 'image/jpeg',
      etag: '"9b2cf535f27731c974343645a3985328"',
    })
    assert.deepInclude(seen[0], { method: 'HEAD', path: `/dripnepal-test-private/${KEY}` })
    assert.isNull(await storage.head('private', KEY, CTX))
  })

  test('T-MED-004 delete ignores a missing object; other failures are unavailable, silence a timeout', async ({
    assert,
  }) => {
    const { storage, seen, lines } = storageWith([
      { statusCode: 204 },
      { statusCode: 404 },
      { statusCode: 503 },
      'hang',
    ])
    await storage.delete('public', 'p/a/b-320.webp', CTX)
    assert.deepInclude(seen[0], { method: 'DELETE', path: '/dripnepal-test-public/p/a/b-320.webp' })
    await storage.delete('private', KEY, CTX)
    assert.instanceOf(await failureOf(storage.head('private', KEY, CTX)), ProviderUnavailableError)
    assert.instanceOf(
      await failureOf(storage.head('private', KEY, { requestId: 'req-2', timeoutMs: 50 })),
      ProviderTimeoutError
    )
    assert.deepEqual(
      lines.map((line) => [line.level, line.fields.operation, line.fields.outcome]),
      [
        ['info', 'delete', 'ok'],
        ['info', 'delete', 'ok'],
        ['warn', 'head', 'unavailable'],
        ['warn', 'head', 'timeout'],
      ]
    )
  })

  test('T-MED-004 with S3_* unset every call fails unavailable and says why', async ({
    assert,
  }) => {
    const { lines, logger } = recordingLogger()
    const storage = new UnconfiguredObjectStorage(logger)
    const presign = storage.presignUpload(
      'private',
      KEY,
      { contentType: 'image/png', expiresInSeconds: 600 },
      CTX
    )
    assert.instanceOf(await failureOf(presign), ProviderUnavailableError)
    assert.instanceOf(await failureOf(storage.head('private', KEY, CTX)), ProviderUnavailableError)
    assert.deepInclude(lines[0].fields, { reason: 'not_configured', outcome: 'unavailable' })
  })
})
