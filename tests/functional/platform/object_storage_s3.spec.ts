import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import type { Logger } from '@adonisjs/core/logger'
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { S3ObjectStorage, s3ClientFor } from '#modules/platform/providers/s3_object_storage'

/*
 * T-MED-005: the S3 adapter against a real S3-compatible server (OD-65,
 * decided 2026-11-25: SeaweedFS, the `seaweedfs` service of
 * docker-compose.yml, which CI starts for the Tests job). The canned-HTTP
 * tests of object_storage.spec.ts prove what the adapter sends; these prove
 * that a store holds it to that, as R2 does (docs/03 §7.5, 07 TM-15, TM-16):
 *
 * - a presigned upload accepts the declared type, and refuses another type,
 *   no type, the URL edited to another key, and the URL after it expires;
 * - `head` reports the stored size, type and the ETag the PUT answered, and
 *   null once `delete` removed the object; deleting it again is no error;
 * - a read with `If-Match` on a stale ETag is refused with 412, also after
 *   the still-valid URL overwrote the object, which is what lets the worker
 *   read only the object `completeMediaUpload` checked (2d-ii);
 * - the public bucket is readable without credentials, the private one is
 *   not, as `MEDIA_PUBLIC_URL` and 03 §3.5 expect.
 *
 * The server's values are the development ones of docker/seaweedfs/s3.json,
 * on the test buckets. Without a server on S3_CONTRACT_ENDPOINT (default
 * http://127.0.0.1:8333) the tests are skipped, unless S3_CONTRACT_REQUIRED=1,
 * as in CI, where a missing server fails them.
 */

const ENDPOINT = process.env.S3_CONTRACT_ENDPOINT ?? 'http://127.0.0.1:8333'
const REQUIRED = process.env.S3_CONTRACT_REQUIRED === '1'
const SETTINGS = {
  endpoint: ENDPOINT,
  region: 'auto',
  accessKeyId: 'dripnepal-dev',
  secretAccessKey: 'dripnepal-dev-secret',
}
const BUCKETS = { private: 'dripnepal-test-private', public: 'dripnepal-test-public' }
const CTX = { requestId: 'req-t-med-005', timeoutMs: 5000 }

const reachable = await fetch(`${ENDPOINT}/healthz`, { signal: AbortSignal.timeout(1500) }).then(
  (response) => response.ok,
  () => false
)
const SKIP = !reachable && !REQUIRED
const SKIP_REASON = `no S3 server at ${ENDPOINT}: docker compose up -d seaweedfs`

const quiet = { info: () => {}, warn: () => {} } as unknown as Logger
const client = s3ClientFor(SETTINGS)
const storage = new S3ObjectStorage(client, BUCKETS, quiet)

// The smallest JPEG start; the store never looks inside.
const BYTES = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(996, 7)])
const uploadKey = () => `originals/t-med-005/${randomUUID()}`
const put = (url: string, body: Buffer, contentType?: string) =>
  fetch(url, {
    method: 'PUT',
    body,
    headers: contentType ? { 'Content-Type': contentType } : {},
  })
const statusOf = (error: unknown) =>
  (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode

test.group('T-MED-005 the S3 adapter against a real S3 server', (group) => {
  const written: Array<['private' | 'public', string]> = []
  group.each.setup(() => {
    if (REQUIRED) {
      // In CI a missing server is a failure, never a skip.
      if (!reachable) throw new Error(`S3_CONTRACT_REQUIRED=1 but ${SKIP_REASON}`)
    }
  })
  group.teardown(async () => {
    for (const [bucket, key] of written) await storage.delete(bucket, key, CTX)
  })

  test('T-MED-005 a presigned upload accepts the declared type only, for its key, until it expires', async ({
    assert,
  }) => {
    const key = uploadKey()
    written.push(['private', key])
    const upload = await storage.presignUpload(
      'private',
      key,
      { contentType: 'image/jpeg', expiresInSeconds: 600 },
      CTX
    )
    assert.equal(new URL(upload.url).origin, new URL(ENDPOINT).origin)

    const wrongType = await put(upload.url, BYTES, 'image/png')
    assert.equal(wrongType.status, 403)
    assert.include(await wrongType.text(), 'SignatureDoesNotMatch')
    const noType = await put(upload.url, BYTES)
    assert.equal(noType.status, 403)
    await noType.body?.cancel()
    assert.isNull(await storage.head('private', key, CTX), 'nothing stored by a refused PUT')

    const otherKey = await put(upload.url.replace(key, `${key}-other`), BYTES, 'image/jpeg')
    assert.equal(otherKey.status, 403)
    await otherKey.body?.cancel()
    assert.isNull(await storage.head('private', `${key}-other`, CTX))

    const declared = await put(upload.url, BYTES, upload.headers['Content-Type'])
    assert.equal(declared.status, 200)
    await declared.body?.cancel()

    const shortKey = uploadKey()
    const short = await storage.presignUpload(
      'private',
      shortKey,
      { contentType: 'image/jpeg', expiresInSeconds: 1 },
      CTX
    )
    // Signed at a whole second at most a second ago, so expired after two.
    await new Promise((resolve) => setTimeout(resolve, 2100))
    const expired = await put(short.url, BYTES, 'image/jpeg')
    assert.equal(expired.status, 403)
    await expired.body?.cancel()
    assert.isNull(await storage.head('private', shortKey, CTX))
  }).skip(SKIP, SKIP_REASON)

  test('T-MED-005 head reports the stored object until delete removes it', async ({ assert }) => {
    const key = uploadKey()
    written.push(['private', key])
    const upload = await storage.presignUpload(
      'private',
      key,
      { contentType: 'image/webp', expiresInSeconds: 600 },
      CTX
    )
    const response = await put(upload.url, BYTES, 'image/webp')
    assert.equal(response.status, 200)
    await response.body?.cancel()

    const stored = await storage.head('private', key, CTX)
    assert.deepEqual(stored, {
      bytes: BYTES.length,
      contentType: 'image/webp',
      etag: response.headers.get('etag') ?? 'missing',
    })
    assert.match(stored?.etag ?? '', /^"[^"]+"$/)

    await storage.delete('private', key, CTX)
    assert.isNull(await storage.head('private', key, CTX))
    await storage.delete('private', key, CTX)
  }).skip(SKIP, SKIP_REASON)

  test('T-MED-005 a read with If-Match on a stale ETag is refused, also after an overwrite', async ({
    assert,
  }) => {
    const key = uploadKey()
    written.push(['private', key])
    const upload = await storage.presignUpload(
      'private',
      key,
      { contentType: 'image/jpeg', expiresInSeconds: 600 },
      CTX
    )
    const first = await put(upload.url, BYTES, 'image/jpeg')
    await first.body?.cancel()
    const checked = await storage.head('private', key, CTX)
    assert.isNotNull(checked)
    const etag = checked?.etag ?? ''

    const current = await client.send(
      new GetObjectCommand({ Bucket: BUCKETS.private, Key: key, IfMatch: etag })
    )
    const body = Buffer.from((await current.Body?.transformToByteArray()) ?? [])
    assert.isTrue(body.equals(BYTES))

    const stale = await client
      .send(new GetObjectCommand({ Bucket: BUCKETS.private, Key: key, IfMatch: '"0123abcd"' }))
      .then(
        () => null,
        (error: unknown) => error
      )
    assert.equal(statusOf(stale), 412)

    // The URL stays valid for 10 minutes and a store lets it overwrite (R2 does).
    const replaced = await put(upload.url, Buffer.concat([BYTES, BYTES]), 'image/jpeg')
    assert.equal(replaced.status, 200)
    await replaced.body?.cancel()
    const afterOverwrite = await client
      .send(new GetObjectCommand({ Bucket: BUCKETS.private, Key: key, IfMatch: etag }))
      .then(
        () => null,
        (error: unknown) => error
      )
    assert.equal(statusOf(afterOverwrite), 412)
  }).skip(SKIP, SKIP_REASON)

  test('T-MED-005 the public bucket reads without credentials, the private one does not', async ({
    assert,
  }) => {
    const publicKey = `derived/t-med-005/${randomUUID()}.webp`
    written.push(['public', publicKey])
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKETS.public,
        Key: publicKey,
        Body: BYTES,
        ContentType: 'image/webp',
      })
    )
    const anonymous = await fetch(`${ENDPOINT}/${BUCKETS.public}/${publicKey}`)
    assert.equal(anonymous.status, 200)
    assert.equal(anonymous.headers.get('content-type'), 'image/webp')
    await anonymous.body?.cancel()

    const privateKey = uploadKey()
    written.push(['private', privateKey])
    await client.send(
      new PutObjectCommand({ Bucket: BUCKETS.private, Key: privateKey, Body: BYTES })
    )
    const refused = await fetch(`${ENDPOINT}/${BUCKETS.private}/${privateKey}`)
    assert.equal(refused.status, 403)
    await refused.body?.cancel()
    const anonymousWrite = await fetch(`${ENDPOINT}/${BUCKETS.public}/${publicKey}-anon`, {
      method: 'PUT',
      body: BYTES,
    })
    assert.equal(anonymousWrite.status, 403)
    await anonymousWrite.body?.cancel()
  }).skip(SKIP, SKIP_REASON)
})
