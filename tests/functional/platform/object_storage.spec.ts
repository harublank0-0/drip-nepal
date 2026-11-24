import { test } from '@japa/runner'
import { Readable } from 'node:stream'
import app from '@adonisjs/core/services/app'
import type { Logger } from '@adonisjs/core/logger'
import { ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import { ProviderTimeoutError, ProviderUnavailableError } from '#exceptions/provider_errors'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import {
  S3ObjectStorage,
  UnconfiguredObjectStorage,
  s3ClientFor,
} from '#modules/platform/providers/s3_object_storage'
import { withTx } from '#modules/platform/tx'

/*
 * The `ObjectStorage` port and its S3 adapter (docs/03 §11.1, §11.5;
 * ADR-0013; R1-S part 2d-i), over the real AWS SDK and signer, with the
 * client the binding builds (`s3ClientFor`) and a canned HTTP handler in
 * place of the network (no S3 server runs in CI yet, docs/12 §9 part 2d):
 *
 * - T-ARCH-003, its storage case: the bound, S3 and unconfigured adapters
 *   throw inside a transaction;
 * - T-MED-004, the adapter part: a presigned upload is signed locally (no
 *   request), path-style on the endpoint's origin, valid 10 minutes from a
 *   whole-second signing time that `expiresAt` reports exactly, with the
 *   signed headers exactly `content-type;host` and no checksum parameter (a
 *   checksum of the empty body would make a checking store refuse the real
 *   file); `head` maps an object to its size, type and quoted ETag (empty
 *   when the store sends none), and a 404 to null; `delete` ignores a
 *   missing object; any other failure is `ProviderUnavailable` after the
 *   client's second attempt; a call still running after `timeoutMs`, or
 *   whose `signal` aborts, is aborted and is `ProviderTimeout`; each call
 *   logs one `provider.call` line without a key or URL; with S3_* unset
 *   every call fails with `ProviderUnavailable` and logs `not_configured`.
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

// The adapter over the binding's client whose HTTP handler answers from `responses`.
function storageWith(responses: Canned[]) {
  const seen: Seen[] = []
  const handler = {
    handle: (request: Seen, options?: { abortSignal?: AbortSignal }) => {
      seen.push({ method: request.method, path: request.path, headers: request.headers })
      const next = responses.shift() ?? { statusCode: 500 }
      if (next === 'hang') {
        // As a real handler: nothing comes back until the call is aborted, if it is not already.
        return new Promise((_, reject) => {
          const fail = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
          if (options?.abortSignal?.aborted) fail()
          else options?.abortSignal?.addEventListener('abort', fail, { once: true })
        })
      }
      return Promise.resolve({
        response: {
          statusCode: next.statusCode,
          headers: next.headers ?? {},
          body: Readable.from([]),
        },
      })
    },
  }
  const client = s3ClientFor(
    {
      endpoint: 'http://storage.test:9000',
      region: 'us-east-1',
      accessKeyId: 'test-access-key',
      secretAccessKey: 'test-secret-key',
    },
    handler
  )
  const { lines, logger } = recordingLogger()
  const storage = new S3ObjectStorage(
    client,
    { private: 'dripnepal-test-private', public: 'dripnepal-test-public' },
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
  test('T-ARCH-003 the bound, S3 and unconfigured adapters refuse to run inside a transaction', async ({
    assert,
  }) => {
    const bound = await app.container.make(ObjectStorage)
    const { storage } = storageWith([])
    const { logger } = recordingLogger()
    const calls: ((adapter: ObjectStorage) => Promise<unknown>)[] = [
      (adapter: ObjectStorage) =>
        adapter.presignUpload(
          'private',
          KEY,
          { contentType: 'image/png', expiresInSeconds: 600 },
          CTX
        ),
      (adapter: ObjectStorage) => adapter.head('private', KEY, CTX),
      (adapter: ObjectStorage) => adapter.delete('private', KEY, CTX),
    ]
    for (const adapter of [bound, storage, new UnconfiguredObjectStorage(logger)]) {
      for (const [index, call] of calls.entries()) {
        const error = await failureOf(withTx(() => call(adapter)))
        assert.instanceOf(
          error,
          ProviderCallInsideTransaction,
          `${adapter.constructor.name} ${index}`
        )
      }
    }
  })
})

test.group('T-MED-004 S3 object storage', () => {
  test('T-MED-004 a presigned upload is signed locally, path-style, for 10 minutes, typed, without a checksum', async ({
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
    assert.equal(url.searchParams.get('X-Amz-SignedHeaders'), 'content-type;host')
    assert.isNotEmpty(url.searchParams.get('X-Amz-Signature'))
    const checksums = [...url.searchParams.keys()].filter((name) =>
      name.toLowerCase().includes('checksum')
    )
    assert.deepEqual(checksums, [], 'no checksum of an empty body is signed into the URL')
    const signed = url.searchParams.get('X-Amz-Date')!
    const signedAt = Date.parse(
      `${signed.slice(0, 4)}-${signed.slice(4, 6)}-${signed.slice(6, 11)}:${signed.slice(11, 13)}:${signed.slice(13, 15)}Z`
    )
    assert.equal(upload.expiresAt.getTime(), signedAt + 600_000)
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
    const { storage, seen, lines } = storageWith([
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
      { statusCode: 200, headers: { 'content-length': '10', 'content-type': 'image/png' } },
    ])
    const found = await storage.head('private', KEY, CTX)
    assert.deepEqual(found, {
      bytes: 2048,
      contentType: 'image/jpeg',
      etag: '"9b2cf535f27731c974343645a3985328"',
    })
    assert.deepInclude(seen[0], { method: 'HEAD', path: `/dripnepal-test-private/${KEY}` })
    assert.isNull(await storage.head('private', KEY, CTX))
    assert.deepEqual(
      lines.map((line) => [line.level, line.fields.outcome]),
      [
        ['info', 'ok'],
        ['info', 'not_found'],
      ]
    )
    const tagless = await storage.head('private', KEY, CTX)
    assert.equal(tagless?.etag, '', 'an object without an ETag answers an empty one')
  })

  test('T-MED-004 delete ignores a missing object; other failures are unavailable, silence is aborted', async ({
    assert,
  }) => {
    const { storage, seen, lines } = storageWith([
      { statusCode: 204 },
      { statusCode: 404 },
      { statusCode: 503 },
      { statusCode: 503 },
      'hang',
      'hang',
    ])
    await storage.delete('public', 'p/a/b-320.webp', CTX)
    assert.deepInclude(seen[0], { method: 'DELETE', path: '/dripnepal-test-public/p/a/b-320.webp' })
    await storage.delete('private', KEY, CTX)
    assert.instanceOf(await failureOf(storage.head('private', KEY, CTX)), ProviderUnavailableError)
    assert.lengthOf(seen, 4, 'a 503 is tried twice')
    assert.instanceOf(
      await failureOf(storage.head('private', KEY, { requestId: 'req-2', timeoutMs: 50 })),
      ProviderTimeoutError
    )
    // A time limit far away, so only the caller's abort can end the call quickly.
    const caller = new AbortController()
    const startedAt = Date.now()
    const pending = failureOf(
      storage.head('private', KEY, { requestId: 'req-3', timeoutMs: 60_000, signal: caller.signal })
    )
    caller.abort()
    assert.instanceOf(await pending, ProviderTimeoutError, 'the caller’s signal aborts the call')
    assert.deepInclude(lines.at(-1)!.fields, { outcome: 'timeout', reason: 'aborted' })
    assert.isBelow(Date.now() - startedAt, 1000, 'at once, not at the time limit')
    assert.deepEqual(
      lines.map((line) => [line.level, line.fields.operation, line.fields.outcome]),
      [
        ['info', 'delete', 'ok'],
        ['info', 'delete', 'ok'],
        ['warn', 'head', 'unavailable'],
        ['warn', 'head', 'timeout'],
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
    assert.instanceOf(
      await failureOf(storage.delete('private', KEY, CTX)),
      ProviderUnavailableError
    )
    assert.deepInclude(lines[0].fields, { reason: 'not_configured', outcome: 'unavailable' })
    assert.lengthOf(lines, 3)
  })
})
