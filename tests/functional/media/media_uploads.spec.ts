import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProviderUnavailableError } from '#exceptions/provider_errors'
import { rateLimiter, rateLimitKey } from '#modules/platform/rate_limits'
import type { Browser } from '#tests/support/browser'
import { fields, world, type World } from '#tests/support/catalog'
import { signIn, send } from '#tests/support/courier_http'
import { queued, useJobBoss } from '#tests/support/jobs'
import { fakeObjectStorage, type MemoryObjectStorage } from '#tests/support/object_storage'
import { addMember, setShopStatus } from '#tests/support/shops'

/*
 * The seller's uploads over HTTP (docs/06 §13.5; 03 §7.5; ADR-0013
 * decision 2; 07 TM-15, TM-16; R1-S part 2d-i), with the in-memory
 * `ObjectStorage` (docs/10 §3.6):
 *
 * - T-MED-004: `createMediaUpload` answers 201 with a presigned upload for
 *   the key `originals/<shop_id>/<id>`, the declared type bound, valid 10
 *   minutes, and the asset `pending_upload`, without `Location`; a kind
 *   other than `product_image`, another type, a size of 0 or above 10 MB
 *   is 422 and writes nothing; a store that cannot sign is 503 and writes
 *   nothing; a shop's 120th upload in an hour passes and its 121st is 429.
 *   `completeMediaUpload` moves an object of the declared type to
 *   `processing` with its ETag and its stored size, which may differ from
 *   the declared one (that stays `bytes`), and sends `media.process_upload`
 *   (202); no object is 409 `upload_missing` and the seller may finish
 *   later; a `HEAD` that fails is 503 and changes nothing; an empty object,
 *   one above 10 MB, of another type or with an ETag the column cannot hold
 *   is `rejected` with a reason and deleted, with no job (200), also when
 *   the delete fails; a second finish is 409 `INVALID_STATE_TRANSITION`; an
 *   asset of a kind R1-S does not offer is 403.
 * - T-SEC-001: another shop's asset, an unknown one or a non-UUID is 404
 *   and changes nothing.
 * - T-SEC-003: `shop_id` or any other member is `unknown_field`; the finish
 *   takes no member.
 * - T-SEC-030: a viewer or an order fulfiller cannot upload or finish a
 *   product image; a catalog editor can.
 * - T-SEC-031: a suspended shop cannot upload or finish one.
 */

const uploadsPath = (w: World) => `/api/v1/seller/shops/${w.shop.slug}/media/uploads`
const completePath = (w: World, id: string) =>
  `/api/v1/seller/shops/${w.shop.slug}/media/${id}/complete`

const image = (overrides: Record<string, unknown> = {}) => ({
  kind: 'product_image',
  mime: 'image/jpeg',
  bytes: 2048,
  ...overrides,
})

function create(w: World, body: unknown, as: Browser = w.owner) {
  return send(as, 'POST', uploadsPath(w), body)
}

function complete(w: World, id: string, as: Browser = w.owner, body: unknown = {}) {
  return send(as, 'POST', completePath(w, id), body)
}

const assetRow = (id: string) => db.from('media_assets').where('id', id).firstOrFail()

async function jobsFor(mediaAssetId: string) {
  const jobs = await queued<{ media_asset_id: string; request_id: string | null }>(
    'media.process_upload'
  )
  return jobs.filter((job) => job.data.media_asset_id === mediaAssetId)
}

// A created upload whose object the "browser" has PUT: bytes, type and ETag as given.
async function uploaded(
  w: World,
  storage: MemoryObjectStorage,
  object: { bytes: number; contentType: string | null; etag?: string } = {
    bytes: 2048,
    contentType: 'image/jpeg',
  }
) {
  const created = await create(w, image())
  const id = created.body.data.media_asset_id as string
  storage.put(
    'private',
    `originals/${w.shop.shopId}/${id}`,
    object.bytes,
    object.contentType,
    object.etag
  )
  return id
}

test.group('T-MED-004 createMediaUpload and completeMediaUpload', (group) => {
  let storage: ReturnType<typeof fakeObjectStorage>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    storage = fakeObjectStorage()
    return () => storage.restore()
  })

  test('T-MED-004 an upload answers a presigned PUT for its key, typed and valid 10 minutes', async ({
    assert,
  }) => {
    const w = await world()
    const before = Date.now()
    const response = await create(w, image({ mime: 'image/webp', bytes: 3_000_000 }))
    assert.equal(response.status, 201, response.text)
    assert.isNull(response.headers.get('location'))
    const {
      media_asset_id: id,
      upload_url: url,
      headers,
      expires_at: expiresAt,
      asset,
    } = response.body.data
    const key = `originals/${w.shop.shopId}/${id}`
    assert.deepEqual(storage.fake.presigned, [
      { bucket: 'private', key, contentType: 'image/webp', expiresInSeconds: 600 },
    ])
    assert.equal(url, `https://storage.test/private/${key}?X-Amz-Expires=600`)
    assert.deepEqual(headers, { 'Content-Type': 'image/webp' })
    const expires = Date.parse(expiresAt)
    assert.isAtLeast(expires, before + 599_000)
    assert.isAtMost(expires, Date.now() + 600_000)
    assert.deepInclude(asset, {
      id,
      kind: 'product_image',
      status: 'pending_upload',
      mime: 'image/webp',
      bytes: 3_000_000,
      rejection_reason: null,
    })
    const row = await assetRow(id)
    assert.deepInclude(row, {
      shop_id: w.shop.shopId,
      status: 'pending_upload',
      original_key: key,
      uploaded_by: w.shop.ownerId,
      upload_etag: null,
    })
  })

  test('T-MED-004 another kind or type, a size of 0 or above 10 MB is 422 and writes nothing', async ({
    assert,
  }) => {
    const w = await world()
    const cases: [unknown, [string, string]][] = [
      [image({ kind: 'shop_logo' }), ['kind', 'enum']],
      [image({ kind: 'kyc_document' }), ['kind', 'enum']],
      [image({ mime: 'image/gif' }), ['mime', 'enum']],
      [image({ mime: 'application/pdf' }), ['mime', 'enum']],
      [image({ bytes: 0 }), ['bytes', 'min']],
      [image({ bytes: 10_485_761 }), ['bytes', 'max']],
      [image({ bytes: '2048' }), ['bytes', 'number']],
      [{ kind: 'product_image', mime: 'image/png' }, ['bytes', 'required']],
    ]
    for (const [body, expected] of cases) {
      const response = await create(w, body)
      assert.equal(response.status, 422, JSON.stringify(body))
      assert.deepEqual(fields(response.body), [expected], JSON.stringify(body))
    }
    const ok = await create(w, image({ bytes: 10_485_760 }))
    assert.equal(ok.status, 201, 'exactly 10 MB is allowed')
    assert.lengthOf(await db.from('media_assets').where('shop_id', w.shop.shopId), 1)
  })

  test('T-MED-004 a store that cannot sign is 503 and leaves no asset', async ({ assert }) => {
    const w = await world()
    storage.fake.failNext(new ProviderUnavailableError('s3', 'presign_upload'))
    const response = await create(w, image())
    assert.equal(response.status, 503)
    assert.equal(response.body.code, 'PROVIDER_UNAVAILABLE')
    assert.lengthOf(await db.from('media_assets').where('shop_id', w.shop.shopId), 0)
  })

  test('T-MED-004 past 120 uploads in an hour a shop gets 429, whoever uploads', async ({
    assert,
  }) => {
    const w = await world()
    await rateLimiter('media_upload').set(
      rateLimitKey('media_upload', w.shop.shopId),
      119,
      '1 hour'
    )
    const editor = await signIn(await addMember(w.shop.shopId, 'catalog_editor'))
    const last = await create(w, image())
    assert.equal(last.status, 201, 'the 120th upload passes')
    const refused = await create(w, image(), editor)
    assert.equal(refused.status, 429)
    assert.equal(refused.body.code, 'RATE_LIMITED')
    assert.isNotNull(refused.headers.get('retry-after'))
    assert.lengthOf(await db.from('media_assets').where('shop_id', w.shop.shopId), 1)
    const other = await world()
    const elsewhere = await create(other, image())
    assert.equal(elsewhere.status, 201, 'the limit is per shop')
  })

  test('T-MED-004 a finish moves the object as declared to processing and sends the job', async ({
    assert,
  }) => {
    const w = await world()
    const id = await uploaded(w, storage.fake)
    const response = await complete(w, id)
    assert.equal(response.status, 202, response.text)
    assert.deepInclude(response.body.data, { id, status: 'processing', rejection_reason: null })
    const row = await assetRow(id)
    assert.deepInclude(row, { status: 'processing', upload_etag: '"etag-1"', upload_bytes: 2048 })
    const jobs = await jobsFor(id)
    assert.lengthOf(jobs, 1)
    assert.equal(jobs[0].data.request_id, response.headers.get('x-request-id'))

    const again = await complete(w, id)
    assert.equal(again.status, 409)
    assert.equal(again.body.code, 'INVALID_STATE_TRANSITION')
    assert.equal(again.body.current_status, 'processing')
    assert.lengthOf(await jobsFor(id), 1)
  })

  test('T-MED-004 no object yet is 409 upload_missing; the seller may PUT and finish again', async ({
    assert,
  }) => {
    const w = await world()
    const created = await create(w, image())
    const id = created.body.data.media_asset_id as string
    const early = await complete(w, id)
    assert.equal(early.status, 409)
    assert.equal(early.body.code, 'CONFLICT')
    assert.deepEqual(fields(early.body), [[null, 'upload_missing']])
    const row = await assetRow(id)
    assert.equal(row.status, 'pending_upload')
    assert.lengthOf(await jobsFor(id), 0)
    storage.fake.put('private', `originals/${w.shop.shopId}/${id}`, 1024, 'image/jpeg')
    const later = await complete(w, id)
    assert.equal(later.status, 202, later.text)
    assert.equal(later.body.data.bytes, 2048, 'the declared size stays bytes')
    const processing = await assetRow(id)
    assert.deepInclude(processing, { bytes: 2048, upload_bytes: 1024 })
  })

  test('T-MED-004 a HEAD that fails is 503 and changes nothing', async ({ assert }) => {
    const w = await world()
    const id = await uploaded(w, storage.fake)
    storage.fake.failNextOn('head', new ProviderUnavailableError('s3', 'head'))
    const response = await complete(w, id)
    assert.equal(response.status, 503)
    assert.equal(response.body.code, 'PROVIDER_UNAVAILABLE')
    const row = await assetRow(id)
    assert.deepInclude(row, { status: 'pending_upload', upload_etag: null })
    assert.lengthOf(await jobsFor(id), 0)
  })

  test('T-MED-004 an asset of a kind R1-S does not offer is 403 to finish', async ({ assert }) => {
    const w = await world()
    const [logo] = await db
      .table('media_assets')
      .insert({
        shop_id: w.shop.shopId,
        kind: 'shop_logo',
        mime: 'image/png',
        bytes: 100,
        original_key: 'originals/x/y',
        uploaded_by: w.shop.ownerId,
      })
      .returning('id')
    const response = await complete(w, logo.id)
    assert.equal(response.status, 403)
    assert.equal(response.body.code, 'FORBIDDEN')
    const row = await assetRow(logo.id)
    assert.equal(row.status, 'pending_upload')
    assert.lengthOf(storage.fake.contexts, 0, 'the store is not asked')
  })

  test('T-MED-004 an empty, oversized or retyped object is rejected with a reason and deleted', async ({
    assert,
  }) => {
    const w = await world()
    const cases: [{ bytes: number; contentType: string | null; etag?: string }, string][] = [
      [{ bytes: 0, contentType: 'image/jpeg' }, 'The file is empty.'],
      [{ bytes: 10_485_761, contentType: 'image/jpeg' }, 'The file is larger than 10 MB.'],
      [
        { bytes: 2048, contentType: 'text/html' },
        'The file type does not match the type declared.',
      ],
      [{ bytes: 2048, contentType: null }, 'The file type does not match the type declared.'],
      [{ bytes: 2048, contentType: 'image/jpeg', etag: '' }, 'The file could not be checked.'],
      [
        { bytes: 2048, contentType: 'image/jpeg', etag: `"${'a'.repeat(127)}"` },
        'The file could not be checked.',
      ],
    ]
    for (const [object, reason] of cases) {
      const id = await uploaded(w, storage.fake, object)
      const response = await complete(w, id)
      assert.equal(response.status, 200, reason)
      assert.deepInclude(response.body.data, { status: 'rejected', rejection_reason: reason })
      const row = await assetRow(id)
      assert.deepInclude(row, { status: 'rejected', upload_etag: null, upload_bytes: null }, reason)
      assert.isFalse(storage.fake.has('private', `originals/${w.shop.shopId}/${id}`), reason)
      assert.lengthOf(await jobsFor(id), 0, reason)
    }

    // A delete that fails after the commit is left to the cleanup job; the answer stands.
    const id = await uploaded(w, storage.fake, { bytes: 0, contentType: 'image/jpeg' })
    storage.fake.failNextOn('delete', new ProviderUnavailableError('s3', 'delete'))
    const response = await complete(w, id)
    assert.equal(response.status, 200, response.text)
    const row = await assetRow(id)
    assert.equal(row.status, 'rejected')
    assert.isTrue(
      storage.fake.has('private', `originals/${w.shop.shopId}/${id}`),
      'the delete was tried and failed'
    )
  })
})

test.group('T-SEC-001 T-SEC-003 T-SEC-030 T-SEC-031 upload access', (group) => {
  let storage: ReturnType<typeof fakeObjectStorage>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    storage = fakeObjectStorage()
    return () => storage.restore()
  })

  test('T-SEC-001 another shop’s asset, an unknown one or a non-UUID is 404 and changes nothing', async ({
    assert,
  }) => {
    const w = await world()
    const theirs = await world()
    const id = await uploaded(theirs, storage.fake)
    const foreign = await complete(w, id)
    assert.equal(foreign.status, 404)
    assert.equal(foreign.body.code, 'NOT_FOUND')
    const unknown = await complete(w, '01929a50-0000-7000-8000-0000000000ff')
    assert.equal(unknown.status, 404)
    const { request_id: foreignRequest, ...foreignBody } = foreign.body
    const { request_id: unknownRequest, ...unknownBody } = unknown.body
    assert.notEqual(foreignRequest, unknownRequest)
    assert.deepEqual(foreignBody, unknownBody, 'another shop’s asset looks missing')
    const malformed = await complete(w, 'not-a-uuid')
    assert.equal(malformed.status, 404)
    const row = await assetRow(id)
    assert.equal(row.status, 'pending_upload')
    assert.lengthOf(storage.fake.contexts, 1, 'only the other shop’s own presign reached the store')
  })

  test('T-SEC-003 server-owned or unknown members are unknown_field; the finish takes none', async ({
    assert,
  }) => {
    const w = await world()
    for (const extra of [
      { shop_id: w.shop.shopId },
      { status: 'ready' },
      { document_type: 'other' },
    ]) {
      const response = await create(w, image(extra))
      assert.equal(response.status, 422, JSON.stringify(extra))
      assert.deepInclude(
        fields(response.body).map(([, code]) => code),
        'unknown_field'
      )
    }
    const id = await uploaded(w, storage.fake)
    const withBody = await complete(w, id, w.owner, { upload_etag: '"x"' })
    assert.deepEqual(fields(withBody.body), [['upload_etag', 'unknown_field']])
    const withQuery = await send(w.owner, 'POST', `${completePath(w, id)}?force=1`, {})
    assert.equal(withQuery.status, 400)
    const row = await assetRow(id)
    assert.equal(row.status, 'pending_upload')
  })

  test('T-SEC-030 a viewer or fulfiller cannot upload or finish a product image; a catalog editor can', async ({
    assert,
  }) => {
    const w = await world()
    const id = await uploaded(w, storage.fake)
    for (const role of ['viewer', 'order_fulfiller']) {
      const browser = await signIn(await addMember(w.shop.shopId, role))
      const created = await create(w, image(), browser)
      assert.equal(created.status, 403, role)
      assert.equal(created.body.code, 'FORBIDDEN', role)
      const finished = await complete(w, id, browser)
      assert.equal(finished.status, 403, role)
    }
    const editorId = await addMember(w.shop.shopId, 'catalog_editor')
    const editor = await signIn(editorId)
    const finished = await complete(w, id, editor)
    assert.equal(finished.status, 202, finished.text)
    const created = await create(w, image(), editor)
    assert.equal(created.status, 201, created.text)
    const row = await assetRow(created.body.data.media_asset_id)
    assert.equal(row.uploaded_by, editorId)
  })

  test('T-SEC-031 a suspended shop cannot upload or finish a product image', async ({ assert }) => {
    const w = await world()
    const id = await uploaded(w, storage.fake)
    await setShopStatus(w.shop.shopId, 'suspended', 'fulfill_existing')
    const created = await create(w, image())
    assert.equal(created.status, 403)
    assert.equal(created.body.code, 'SHOP_NOT_ACTIVE')
    const finished = await complete(w, id)
    assert.equal(finished.body.code, 'SHOP_NOT_ACTIVE')
    const row = await assetRow(id)
    assert.equal(row.status, 'pending_upload')
  })
})
