import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProviderUnavailableError } from '#exceptions/provider_errors'
import { uploadKey } from '#modules/media/domain/media_keys'
import { cleanupAbandoned } from '#modules/media/jobs/cleanup_abandoned'
import { fakeObjectStorage, type MemoryObjectStorage } from '#tests/support/object_storage'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-MED-003: `media.cleanup_abandoned` (docs/03 §9, ADR-0013 decision 6,
 * 04a §7.13; R1-S part 2d-ii). An upload never finished (`pending_upload`)
 * or `rejected`, created more than 24 hours ago, loses its object and
 * becomes `deleted`; one created less than 24 hours ago, and any
 * `processing` or `ready` asset however old, is left as it is. An object
 * already gone is no error. A store failure fails the run, leaving the
 * asset for the next run, which finishes it.
 */

type Fixture = { shop: OwnerShop; storage: MemoryObjectStorage }

async function asset(f: Fixture, status: string, hoursAgo: number, withObject = true) {
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: f.shop.shopId,
      kind: 'product_image',
      status,
      original_key: 'pending',
      mime: 'image/jpeg',
      bytes: 2048,
      ...(status === 'processing' || status === 'ready'
        ? { upload_etag: '"e"', upload_bytes: 2048 }
        : {}),
      ...(status === 'rejected' ? { rejection_reason: 'The file is empty.' } : {}),
      ...(status === 'ready'
        ? {
            sha256: Buffer.alloc(32),
            processed_at: db.raw('now()'),
            derived_keys: JSON.stringify({ 320: 'p/x/y-320.webp' }),
            width: 320,
            height: 320,
          }
        : {}),
      uploaded_by: f.shop.ownerId,
      created_at: db.raw(`now() - make_interval(hours => ?::int)`, [hoursAgo]),
    })
    .returning('id')
  const key = uploadKey(f.shop.shopId, row.id)
  await db.from('media_assets').where('id', row.id).update({ original_key: key })
  if (withObject) f.storage.upload('private', key, 2048, 'image/jpeg')
  return { id: row.id as string, key }
}

async function statusOf(id: string) {
  const row = await db.from('media_assets').where('id', id).select('status').firstOrFail()
  return row.status as string
}

test.group('T-MED-003 media.cleanup_abandoned', (group) => {
  let f: Fixture
  group.each.setup(async () => {
    const storage = fakeObjectStorage()
    f = { shop: await createOwnerShop(), storage: storage.fake }
    return () => storage.restore()
  })

  test('T-MED-003 abandoned and rejected uploads older than 24 h lose their objects', async ({
    assert,
  }) => {
    const abandoned = await asset(f, 'pending_upload', 25)
    const rejected = await asset(f, 'rejected', 30)
    const alreadyGone = await asset(f, 'pending_upload', 48, false)
    const recent = await asset(f, 'pending_upload', 23)
    const recentRejected = await asset(f, 'rejected', 1)
    const working = await asset(f, 'processing', 72)
    const ready = await asset(f, 'ready', 72)

    await cleanupAbandoned('req-cleanup')

    for (const gone of [abandoned, rejected, alreadyGone]) {
      assert.equal(await statusOf(gone.id), 'deleted')
      assert.isFalse(f.storage.has('private', gone.key))
      assert.include(f.storage.deleted, `private/${gone.key}`)
    }
    for (const kept of [recent, recentRejected, working, ready]) {
      assert.notEqual(await statusOf(kept.id), 'deleted')
      assert.isTrue(f.storage.has('private', kept.key))
      assert.notInclude(f.storage.deleted, `private/${kept.key}`)
    }
    assert.equal(await statusOf(recentRejected.id), 'rejected')
  })

  test('T-MED-003 a store failure fails the run and leaves the asset; the next run deletes it', async ({
    assert,
  }) => {
    const abandoned = await asset(f, 'pending_upload', 26)
    f.storage.failNextOn('delete', new ProviderUnavailableError('s3', 'delete'))
    await assert.rejects(() => cleanupAbandoned(null), ProviderUnavailableError)
    assert.equal(await statusOf(abandoned.id), 'pending_upload')

    await cleanupAbandoned(null)
    assert.equal(await statusOf(abandoned.id), 'deleted')
    assert.isFalse(f.storage.has('private', abandoned.key))
  })
})
