import type { Assert } from '@japa/assert'
import { test } from '@japa/runner'
import { createHash } from 'node:crypto'
import { crc32, deflateSync } from 'node:zlib'
import db from '@adonisjs/lucid/services/db'
import sharp from 'sharp'
import { ProductFactory } from '#database/factories/product_factory'
import { ProviderUnavailableError } from '#exceptions/provider_errors'
import { finalKey, uploadKey } from '#modules/media/domain/media_keys'
import { loadSharp, sharpImageCodec, type ImageCodec } from '#modules/media/internal/image_codec'
import { REJECTIONS, processUpload } from '#modules/media/jobs/process_upload'
import { queued, useJobBoss } from '#tests/support/jobs'
import { fakeObjectStorage, type MemoryObjectStorage } from '#tests/support/object_storage'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * `media.process_upload` (docs/03 §7.5, ADR-0013 decision 3, 07 TM-15; R1-S
 * part 2d-ii), with real sharp and the in-memory `ObjectStorage` (docs/10
 * §3.6). Each asset is inserted `processing`, as `completeMediaUpload`
 * leaves it, and its object uploaded with the recorded ETag; the handler is
 * called with the job's payload.
 *
 * - T-MED-001: a JPEG becomes `ready` with the final key, its size and
 *   SHA-256, and WebP derivatives at the widths up to its own in the public
 *   bucket, immutable and without EXIF or GPS; the upload key is deleted.
 *   An image narrower than 320 px gets one derivative; the EXIF orientation
 *   is applied. Over 40 megapixels (also a 20,000 × 20,000 PNG of a few
 *   hundred bytes), interlaced over 12, and damaged images are rejected
 *   with a reason, nothing written, the upload key deleted; so is an image
 *   whose header reads but whose data is cut short, after one decode. An
 *   object missing, or above 10 MB, is rejected without being decoded. A
 *   store failure, or a sharp that cannot load, throws, so pg-boss retries,
 *   and leaves the asset `processing` with its object; the retry finishes
 *   it. A rejection also deletes a final key an earlier attempt wrote. A second run does nothing, except delete a
 *   `ready` asset's upload key again. `media.ready` sends
 *   `catalog.refresh_listing` for each product showing the asset.
 * - T-SEC-018: an SVG, an HTML page, and a GIF, TIFF or AVIF labelled
 *   `image/jpeg` are rejected without sharp being called, as is a PNG
 *   declared as JPEG; an object overwritten after `completeMediaUpload`
 *   (20 MB or not) is rejected unread; a JPEG/HTML polyglot yields
 *   derivatives that hold none of the HTML, and its original stays private;
 *   only the JPEG, PNG and WebP loaders parse anything.
 */

type Fixture = { shop: OwnerShop; storage: MemoryObjectStorage }

const MB = 1024 * 1024

async function jpeg(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#4a7' } })
    .jpeg()
    .toBuffer()
}

// The header of a PNG that claims `width` × `height`, with a few compressed bytes of image data.
function pngHeader(width: number, height: number, interlaced = false) {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(0, 9) // greyscale
  ihdr.writeUInt8(interlaced ? 1 : 0, 12)
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(64))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// An asset as `completeMediaUpload` leaves it, with its object in the store under the same ETag.
async function processing(
  f: Fixture,
  body: Buffer | number,
  mime = 'image/jpeg',
  etag = `"etag-${Math.random().toString(36).slice(2)}"`
) {
  const size = typeof body === 'number' ? body : body.length
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: f.shop.shopId,
      kind: 'product_image',
      status: 'processing',
      original_key: 'pending',
      mime,
      bytes: Math.min(size, 10 * MB),
      upload_etag: etag,
      upload_bytes: Math.min(size, 10 * MB),
      uploaded_by: f.shop.ownerId,
    })
    .returning('id')
  const key = uploadKey(f.shop.shopId, row.id)
  await db.from('media_assets').where('id', row.id).update({ original_key: key })
  f.storage.upload('private', key, body, mime, etag)
  return { id: row.id as string, key }
}

const job = (id: string) => ({ media_asset_id: id, request_id: 'req-worker', causation_id: null })
const assetRow = (id: string) => db.from('media_assets').where('id', id).firstOrFail()

// The real codec, counting the calls that reach sharp.
function countingCodec() {
  const calls = { inspect: 0, derive: 0 }
  const codec: ImageCodec = {
    load: () => sharpImageCodec.load(),
    inspect: (bytes) => {
      calls.inspect += 1
      return sharpImageCodec.inspect(bytes)
    },
    derive: (bytes, widths) => {
      calls.derive += 1
      return sharpImageCodec.derive(bytes, widths)
    },
  }
  return { calls, codec }
}

async function assertRejected(
  assert: Assert,
  f: Fixture,
  asset: { id: string; key: string },
  reason: string
) {
  const row = await assetRow(asset.id)
  assert.equal(row.status, 'rejected')
  assert.equal(row.rejection_reason, reason)
  assert.equal(row.original_key, asset.key)
  assert.isFalse(f.storage.has('private', asset.key), 'upload key deleted')
  assert.deepEqual(f.storage.written, [], 'nothing written')
}

test.group('T-MED-001 media.process_upload validates and derives', (group) => {
  let f: Fixture
  let restore: () => void
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    const storage = fakeObjectStorage()
    restore = storage.restore
    f = { shop: await createOwnerShop(), storage: storage.fake }
    return () => restore()
  })

  test('T-MED-001 a JPEG becomes ready, with derivatives up to its width and no EXIF or GPS', async ({
    assert,
  }) => {
    const original = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: '#4a7' },
    })
      .jpeg()
      .withExif({
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '27/1 42/1 0/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '85/1 19/1 0/1',
        },
      })
      .toBuffer()
    const inputMetadata = await sharp(original).metadata()
    const inputExif = inputMetadata.exif
    assert.isTrue(
      inputExif?.includes(Buffer.from([0x88, 0x25])) ||
        inputExif?.includes(Buffer.from([0x25, 0x88])),
      'the fixture carries a GPS IFD'
    )
    const asset = await processing(f, original)
    await processUpload(job(asset.id))

    const row = await assetRow(asset.id)
    const sha = createHash('sha256').update(original).digest()
    assert.equal(row.status, 'ready')
    assert.equal(row.original_key, finalKey(f.shop.shopId, asset.id))
    assert.equal(row.width, 1200)
    assert.equal(row.height, 800)
    assert.isTrue(Buffer.from(row.sha256).equals(sha))
    assert.isNotNull(row.processed_at)
    const prefix = sha.toString('hex').slice(0, 16)
    assert.deepEqual(row.derived_keys, {
      320: `p/${asset.id}/${prefix}-320.webp`,
      640: `p/${asset.id}/${prefix}-640.webp`,
      1024: `p/${asset.id}/${prefix}-1024.webp`,
    })
    for (const [width, key] of Object.entries(row.derived_keys as Record<string, string>)) {
      const stored = f.storage.object('public', key)
      assert.equal(stored?.contentType, 'image/webp')
      assert.equal(stored?.cacheControl, 'public, max-age=31536000, immutable')
      const metadata = await sharp(stored!.body!).metadata()
      assert.equal(metadata.format, 'webp')
      assert.equal(metadata.width, Number(width))
      assert.isUndefined(metadata.exif, 'no EXIF, so no GPS')
      assert.isUndefined(metadata.xmp)
    }
    // The bytes read, unchanged, at the final key; the upload key gone.
    assert.isTrue(f.storage.object('private', row.original_key)?.body?.equals(original))
    assert.isFalse(f.storage.has('private', asset.key))
    assert.deepEqual(f.storage.reads, [`private/${asset.key}`])
  })

  test('T-MED-001 an image narrower than 320 px gets one derivative at its own width', async ({
    assert,
  }) => {
    const png = await sharp({
      create: { width: 200, height: 100, channels: 3, background: '#123' },
    })
      .png()
      .toBuffer()
    const asset = await processing(f, png, 'image/png')
    await processUpload(job(asset.id))
    const row = await assetRow(asset.id)
    assert.equal(row.status, 'ready')
    assert.deepEqual(Object.keys(row.derived_keys), ['200'])
  })

  test('T-MED-001 the EXIF orientation is applied to the size and the derivatives', async ({
    assert,
  }) => {
    const rotated = await sharp({
      create: { width: 400, height: 200, channels: 3, background: '#f00' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const asset = await processing(f, rotated)
    await processUpload(job(asset.id))
    const row = await assetRow(asset.id)
    assert.equal(row.width, 200)
    assert.equal(row.height, 400)
    const derived = f.storage.object('public', row.derived_keys['200'])
    const metadata = await sharp(derived!.body!).metadata()
    assert.deepEqual([metadata.width, metadata.height], [200, 400])
  })

  test('T-MED-001 {name} is rejected: {reason}')
    .with([
      {
        name: 'a PNG of 48 megapixels',
        body: () => pngHeader(8000, 6000),
        mime: 'image/png',
        reason: REJECTIONS.too_many_pixels,
      },
      {
        name: 'a 20,000 × 20,000 PNG of a few hundred bytes',
        body: () => pngHeader(20_000, 20_000),
        mime: 'image/png',
        reason: REJECTIONS.too_many_pixels,
      },
      {
        name: 'an interlaced PNG of 14 megapixels',
        body: () => pngHeader(4000, 3500, true),
        mime: 'image/png',
        reason: REJECTIONS.interlaced,
      },
      {
        name: 'a damaged JPEG',
        body: async () => {
          const whole = await jpeg(64, 48)
          return whole.subarray(0, 200)
        },
        mime: 'image/jpeg',
        reason: REJECTIONS.unreadable,
      },
    ])
    .run(async ({ assert }, row) => {
      const counting = countingCodec()
      const asset = await processing(f, await row.body(), row.mime)
      await processUpload(job(asset.id), { codec: counting.codec })
      await assertRejected(assert, f, asset, row.reason)
      assert.equal(counting.calls.derive, 0, 'never decoded')
    })

  test('T-MED-001 an image whose data is cut short is rejected after one decode attempt', async ({
    assert,
  }) => {
    const noise = Buffer.alloc(400 * 300 * 3)
    for (let index = 0; index < noise.length; index++) noise[index] = (index * 7919) % 251
    const whole = await sharp(noise, { raw: { width: 400, height: 300, channels: 3 } })
      .jpeg({ quality: 90 })
      .toBuffer()
    const counting = countingCodec()
    const asset = await processing(f, whole.subarray(0, Math.floor(whole.length * 0.6)))
    await processUpload(job(asset.id), { codec: counting.codec })
    await assertRejected(assert, f, asset, REJECTIONS.unreadable)
    assert.deepEqual(
      counting.calls,
      { inspect: 1, derive: 1 },
      'the header read, the decode failed'
    )
  })

  test('T-MED-001 a sharp that cannot load throws for a retry and rejects nothing', async ({
    assert,
  }) => {
    const asset = await processing(f, await jpeg(64, 48))
    const broken: ImageCodec = {
      load: () => Promise.reject(new Error('Could not load the "sharp" module')),
      inspect: sharpImageCodec.inspect,
      derive: sharpImageCodec.derive,
    }
    await assert.rejects(() => processUpload(job(asset.id), { codec: broken }), /sharp/)
    const row = await assetRow(asset.id)
    assert.equal(row.status, 'processing')
    assert.isTrue(f.storage.has('private', asset.key))
    assert.deepEqual(f.storage.reads, [], 'nothing read before sharp loads')
    assert.deepEqual(f.storage.written, [])
  })

  test('T-MED-001 an object missing or above 10 MB is rejected without being decoded', async ({
    assert,
  }) => {
    const counting = countingCodec()
    const missing = await processing(f, await jpeg(64, 48))
    f.storage.objects.delete(`private/${missing.key}`)
    await processUpload(job(missing.id), { codec: counting.codec })
    await assertRejected(assert, f, missing, REJECTIONS.missing)

    // Same ETag as recorded, but more than 10 MB: refused by size before any byte is held.
    const large = await processing(f, 10 * MB + 1)
    await processUpload(job(large.id), { codec: counting.codec })
    await assertRejected(assert, f, large, REJECTIONS.too_large)
    assert.deepEqual(counting.calls, { inspect: 0, derive: 0 })
  })

  test('T-MED-001 a store failure throws and leaves the asset processing; the retry finishes it', async ({
    assert,
  }) => {
    const asset = await processing(f, await jpeg(700, 400))
    f.storage.failNextOn('put', new ProviderUnavailableError('s3', 'put'))
    await assert.rejects(() => processUpload(job(asset.id)), ProviderUnavailableError)
    const failed = await assetRow(asset.id)
    assert.equal(failed.status, 'processing')
    assert.isTrue(f.storage.has('private', asset.key), 'the upload key is kept for the retry')

    await processUpload(job(asset.id))
    const retried = await assetRow(asset.id)
    assert.equal(retried.status, 'ready')
    assert.isFalse(f.storage.has('private', asset.key))
  })

  test('T-MED-001 a second run does nothing, except delete a ready asset upload key again', async ({
    assert,
  }) => {
    const original = await jpeg(500, 300)
    const asset = await processing(f, original)
    await processUpload(job(asset.id))
    const first = await assetRow(asset.id)
    const writes = f.storage.written.length

    await processUpload(job(asset.id))
    assert.deepEqual(await assetRow(asset.id), first)
    assert.lengthOf(f.storage.written, writes)
    assert.lengthOf(f.storage.reads, 1)

    // A crash after the commit but before the delete leaves the upload key; a redelivery removes it.
    f.storage.upload('private', asset.key, original, 'image/jpeg')
    await processUpload(job(asset.id))
    assert.isFalse(f.storage.has('private', asset.key))
    assert.lengthOf(f.storage.reads, 1)
  })

  test('T-MED-001 media.ready refreshes the listing of each product that shows the asset', async ({
    assert,
  }) => {
    const shown = await processing(f, await jpeg(400, 400))
    const product = await ProductFactory.merge({ shopId: f.shop.shopId }).create()
    // Inserted directly: `replaceProductMedia` (part 2d-iii) will take only `ready` assets.
    await db.table('product_media').insert({
      product_id: product.id,
      shop_id: f.shop.shopId,
      media_asset_id: shown.id,
      position: 1,
    })
    const refreshes = async () => {
      const jobs = await queued<{ product_id: string; request_id: string }>(
        'catalog.refresh_listing'
      )
      return jobs.filter((queuedJob) => queuedJob.data.product_id === product.id)
    }
    const before = await refreshes()
    await processUpload(job(shown.id))
    const after = await refreshes()
    assert.lengthOf(after, before.length + 1)
    assert.equal(after.at(-1)?.data.request_id, 'req-worker')
  })
})

test.group('T-SEC-018 parsing order, loaders and polyglots', (group) => {
  let f: Fixture
  let restore: () => void
  group.setup(async () => {
    await useJobBoss()
  })
  group.each.setup(async () => {
    const storage = fakeObjectStorage()
    restore = storage.restore
    f = { shop: await createOwnerShop(), storage: storage.fake }
    return () => restore()
  })

  test('T-SEC-018 {name} labelled image/jpeg is rejected without sharp')
    .with([
      {
        name: 'an SVG',
        body: async () =>
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>x</script></svg>'),
      },
      {
        name: 'an HTML page',
        body: async () => Buffer.from('<!doctype html><script>alert(1)</script>'),
      },
      {
        name: 'a GIF',
        body: () =>
          sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
            .gif()
            .toBuffer(),
      },
      {
        name: 'a TIFF',
        body: () =>
          sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
            .tiff()
            .toBuffer(),
      },
      {
        name: 'an AVIF',
        body: () =>
          sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
            .avif()
            .toBuffer(),
      },
    ])
    .run(async ({ assert }, row) => {
      const counting = countingCodec()
      const asset = await processing(f, await row.body(), 'image/jpeg')
      await processUpload(job(asset.id), { codec: counting.codec })
      await assertRejected(assert, f, asset, REJECTIONS.not_image)
      assert.deepEqual(counting.calls, { inspect: 0, derive: 0 })
    })

  test('T-SEC-018 a PNG declared as image/jpeg is rejected by its signature, without sharp', async ({
    assert,
  }) => {
    const counting = countingCodec()
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } })
      .png()
      .toBuffer()
    const asset = await processing(f, png, 'image/jpeg')
    await processUpload(job(asset.id), { codec: counting.codec })
    await assertRejected(assert, f, asset, REJECTIONS.wrong_type)
    assert.deepEqual(counting.calls, { inspect: 0, derive: 0 })
  })

  test('T-SEC-018 an object overwritten after completeMediaUpload is rejected unread, 20 MB or not', async ({
    assert,
  }) => {
    const counting = countingCodec()
    for (const replacement of [await jpeg(64, 64), 20 * MB]) {
      const asset = await processing(f, await jpeg(64, 48))
      // The still-valid presigned URL used again: a new object, a new ETag.
      f.storage.upload('private', asset.key, replacement, 'image/jpeg')
      await processUpload(job(asset.id), { codec: counting.codec })
      await assertRejected(assert, f, asset, REJECTIONS.changed)
    }
    assert.deepEqual(counting.calls, { inspect: 0, derive: 0 })
  })

  test('T-SEC-018 a rejection deletes the final key an earlier, failed attempt wrote', async ({
    assert,
  }) => {
    const asset = await processing(f, await jpeg(64, 48))
    // Attempt 1 wrote the checked bytes to the final key, then failed before its commit.
    const final = finalKey(f.shop.shopId, asset.id)
    f.storage.upload('private', final, await jpeg(64, 48), 'image/jpeg')
    f.storage.upload('private', asset.key, await jpeg(32, 32), 'image/jpeg')
    await processUpload(job(asset.id))
    const row = await assetRow(asset.id)
    assert.equal(row.status, 'rejected')
    assert.equal(row.rejection_reason, REJECTIONS.changed)
    assert.isFalse(f.storage.has('private', final))
    assert.isFalse(f.storage.has('private', asset.key))
  })

  test('T-SEC-018 a JPEG/HTML polyglot gives derivatives without the HTML; the original stays private', async ({
    assert,
  }) => {
    const html = '<html><script>alert(document.cookie)</script></html>'
    const polyglot = Buffer.concat([await jpeg(400, 300), Buffer.from(html)])
    const asset = await processing(f, polyglot)
    await processUpload(job(asset.id))
    const row = await assetRow(asset.id)
    assert.equal(row.status, 'ready')
    const publicKeys = [...f.storage.objects.keys()].filter((key) => key.startsWith('public/'))
    assert.deepEqual(
      publicKeys.sort(),
      Object.values(row.derived_keys as Record<string, string>)
        .map((key) => `public/${key}`)
        .sort()
    )
    for (const key of publicKeys) {
      const body = f.storage.objects.get(key)!.body!
      assert.isFalse(body.includes(Buffer.from('<script')), key)
      assert.isFalse(body.includes(Buffer.from('<html')), key)
    }
    assert.isTrue(f.storage.object('private', row.original_key)?.body?.equals(polyglot))
  })

  test('T-SEC-018 only the JPEG, PNG and WebP loaders parse anything', async ({ assert }) => {
    const make = (format: 'jpeg' | 'png' | 'webp' | 'gif' | 'tiff' | 'avif') =>
      sharp({ create: { width: 8, height: 8, channels: 3, background: '#888' } })
        [format]()
        .toBuffer()
    const load = await loadSharp()
    for (const format of ['jpeg', 'png', 'webp'] as const) {
      const metadata = await load(await make(format), {}).metadata()
      assert.equal(metadata.format, format)
    }
    for (const format of ['gif', 'tiff', 'avif'] as const) {
      const input = await make(format)
      await assert.rejects(() => load(input, {}).metadata(), /unsupported image format/)
    }
  })
})
