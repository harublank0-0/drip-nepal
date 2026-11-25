import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { ProviderUnavailableError } from '#exceptions/provider_errors'
import { finalKey, uploadKey } from '#modules/media/domain/media_keys'
import { cleanupAbandoned } from '#modules/media/jobs/cleanup_abandoned'
import { fakeObjectStorage, type MemoryObjectStorage } from '#tests/support/object_storage'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-MED-003: `media.cleanup_abandoned` (docs/03 §9, ADR-0013 decision 6,
 * 04a §7.13; R1-S part 2d-ii). An upload never finished (`pending_upload`)
 * or `rejected`, created more than 24 hours ago, loses its object and
 * becomes `deleted`; one created less than 24 hours ago, and any
 * `processing` or `ready` asset however old, is left as it is. A final key
 * written by a failed attempt goes too. An object already gone is no error.
 * An asset whose delete fails is skipped, the others are still deleted, and
 * the run then fails; the next run deletes the skipped one.
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
    const orphan = finalKey(f.shop.shopId, rejected.id)
    f.storage.upload('private', orphan, 2048, 'image/jpeg')

    await cleanupAbandoned('req-cleanup')
    assert.isFalse(f.storage.has('private', orphan), 'a final key left by a failed attempt')

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

  test('T-MED-003 an asset whose delete fails is skipped, the rest deleted, and the run fails', async ({
    assert,
  }) => {
    const stuck = await asset(f, 'pending_upload', 30)
    const next = await asset(f, 'pending_upload', 26)
    // The oldest asset's first delete fails; the newer one must not wait behind it.
    f.storage.failNextOn('delete', new ProviderUnavailableError('s3', 'delete'))
    await assert.rejects(() => cleanupAbandoned(null), ProviderUnavailableError)
    assert.equal(await statusOf(stuck.id), 'pending_upload')
    assert.isTrue(f.storage.has('private', stuck.key))
    assert.equal(await statusOf(next.id), 'deleted')
    assert.isFalse(f.storage.has('private', next.key))

    await cleanupAbandoned(null)
    assert.equal(await statusOf(stuck.id), 'deleted')
    assert.isFalse(f.storage.has('private', stuck.key))
  })
})
