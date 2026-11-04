import { test } from '@japa/runner'
import sharp from 'sharp'
import drive from '@adonisjs/drive/services/main'
import ProductMedia from '#models/product_media'
import type ProductVariant from '#models/product_variant'
import PhotoBackfillService from '#modules/products/services/photo_backfill_service'
import { createShop, createVariant } from '#tests/support/fixtures'

/*
 * T-MED-001 for the v1 store: photos uploaded before resizing existed are
 * converted once to the two WebP sizes, their originals (with any GPS data)
 * deleted. Rows it can't convert are reported and left as they were, and a
 * second run changes nothing. Storage is Drive's fake disk.
 */

async function legacyPhoto(variant: ProductVariant, name: string, contents?: Buffer) {
  const key = `shops/test/products/${name}`
  if (contents) await drive.use().put(key, contents)
  return ProductMedia.create({
    productId: variant.productId,
    type: 'image',
    provider: 'drive',
    url: await drive.use().getUrl(key),
    altText: 'Old photo',
    metadata: { key, originalName: name },
    sortOrder: 0,
  })
}

function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#36a' } })
    .withExif({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '27/1 42/1 0/1' } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

let disk: ReturnType<typeof drive.fake>

test.group('T-MED-001 converting photos uploaded before resizing [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']).timeout(30_000))
  group.each.setup(() => {
    disk = drive.fake('fs')
    return () => drive.restore('fs')
  })

  test('old originals are converted and deleted; other rows are skipped or reported', async ({
    assert,
  }) => {
    const variant = await createVariant(await createShop())
    const old = await legacyPhoto(variant, 'old.jpg', await jpeg(3000, 2000))
    const missing = await legacyPhoto(variant, 'gone.jpg')
    const notAPhoto = await legacyPhoto(variant, 'page.jpg', Buffer.from('<html></html>'))
    const external = await ProductMedia.create({
      productId: variant.productId,
      type: 'image',
      provider: 'external',
      url: 'https://images.example.test/photo.jpg',
    })
    const done = await ProductMedia.create({
      productId: variant.productId,
      type: 'image',
      provider: 'drive',
      url: '/uploads/x-1600.webp',
      thumbnailUrl: '/uploads/x-640.webp',
      metadata: { key: 'x-1600.webp', thumbnailKey: 'x-640.webp' },
    })

    const untouched = [missing, notAPhoto, external, done]
    const snapshots = new Map<string, unknown>()
    for (const row of untouched) {
      await row.refresh()
      snapshots.set(row.id, row.serialize())
    }

    const summary = await new PhotoBackfillService().run()

    assert.deepEqual(
      { converted: summary.converted, skipped: summary.skipped },
      { converted: 1, skipped: 2 }
    )
    assert.sameMembers(
      summary.failed.map((failure) => failure.mediaId),
      [missing.id, notAPhoto.id]
    )

    await old.refresh()
    assert.match(old.url, /-1600\.webp$/)
    assert.match(old.thumbnailUrl ?? '', /-640\.webp$/)
    assert.equal(old.metadata.originalName, 'old.jpg')
    assert.deepInclude(old.metadata, { width: 1600, height: 1067 })
    const large = await sharp(Buffer.from(await drive.use().getBytes(old.metadata.key))).metadata()
    assert.deepEqual([large.format, large.width, large.exif], ['webp', 1600, undefined])
    disk.assertExists(old.metadata.thumbnailKey)
    disk.assertMissing('shops/test/products/old.jpg')

    // Rows it skipped or couldn't convert are untouched.
    for (const row of untouched) {
      await row.refresh()
      assert.deepEqual(row.serialize(), snapshots.get(row.id))
    }
    disk.assertExists('shops/test/products/page.jpg')
  })

  test('running it again changes nothing', async ({ assert }) => {
    const variant = await createVariant(await createShop())
    const old = await legacyPhoto(variant, 'old.jpg', await jpeg(1200, 900))
    await new PhotoBackfillService().run()
    await old.refresh()
    const afterFirst = old.serialize()

    const summary = await new PhotoBackfillService().run()

    assert.deepEqual(
      { converted: summary.converted, failed: summary.failed },
      { converted: 0, failed: [] }
    )
    await old.refresh()
    assert.deepEqual(old.serialize(), afterFirst)
  })
})
