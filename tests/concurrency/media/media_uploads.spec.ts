import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { purgeOwnerShop } from '#tests/support/concurrency'
import { send, signIn } from '#tests/support/courier_http'
import { queued, useJobBoss } from '#tests/support/jobs'
import { fakeObjectStorage } from '#tests/support/object_storage'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * T-MED-004, the race of two finishes of one upload (docs/06 §13.5, 03
 * §7.5; R1-S part 2d-i), with real commits. Both requests read the asset
 * `pending_upload` and reach the `HEAD` before either writes (the fake
 * store holds each `HEAD` until both wait), so only the compare-and-set
 * from `pending_upload` decides: one answers 202 and sends the job, the
 * other 409 `INVALID_STATE_TRANSITION`, and one job is queued. The shop
 * and everything it wrote are deleted after the test (`purgeOwnerShop`).
 */

let made: OwnerShop | null = null

test.group('T-MED-004 two finishes of one upload', (group) => {
  let storage: ReturnType<typeof fakeObjectStorage>
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(() => {
    storage = fakeObjectStorage()
    return async () => {
      storage.restore()
      if (made) await purgeOwnerShop(made)
      made = null
    }
  })

  test('T-MED-004 two simultaneous finishes: one moves the asset, the other is 409, one job', async ({
    assert,
  }) => {
    const shop = await createOwnerShop()
    made = shop
    const owner = await signIn(shop.ownerId)
    const base = `/api/v1/seller/shops/${shop.slug}/media`
    const created = await send(owner, 'POST', `${base}/uploads`, {
      kind: 'product_image',
      mime: 'image/png',
      bytes: 4096,
    })
    assert.equal(created.status, 201, created.text)
    const id = created.body.data.media_asset_id as string
    storage.fake.put('private', `originals/${shop.shopId}/${id}`, 4096, 'image/png')
    storage.fake.gateHeads(2)

    const responses = await Promise.all([
      send(owner, 'POST', `${base}/${id}/complete`, {}),
      send(owner, 'POST', `${base}/${id}/complete`, {}),
    ])
    assert.deepEqual(
      responses.map((response) => response.status).sort(),
      [202, 409],
      responses.map((response) => response.text).join('\n')
    )
    const refused = responses.find((response) => response.status === 409)!
    assert.equal(refused.body.code, 'INVALID_STATE_TRANSITION')
    assert.equal(refused.body.current_status, 'processing')
    const row = await db.from('media_assets').where('id', id).firstOrFail()
    assert.equal(row.status, 'processing')
    const jobs = await queued<{ media_asset_id: string }>('media.process_upload')
    assert.lengthOf(
      jobs.filter((job) => job.data.media_asset_id === id),
      1
    )
  })
})
