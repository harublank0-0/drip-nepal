import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import app from '@adonisjs/core/services/app'
import type { Logger } from '@adonisjs/core/logger'
import db from '@adonisjs/lucid/services/db'
import sharp from 'sharp'
import { refreshListing } from '#modules/catalog/jobs/refresh_listing'
import { DEFAULT_PER_PAGE } from '#modules/catalog/domain/listing_query'
import { uploadKey } from '#modules/media/domain/media_keys'
import { processUpload } from '#modules/media/jobs/process_upload'
import { ObjectStorage } from '#modules/platform/ports/object_storage'
import { S3ObjectStorage, s3ClientFor } from '#modules/platform/providers/s3_object_storage'
import {
  categoryId,
  create,
  draftBody,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { act, configureShipping } from '#tests/support/storefront_products'

/*
 * The launch catalogue the Lighthouse run measures (T-PERF-003, docs/08
 * §10.1; R1-S part 3d-iii-c): the owner's shop with one listing page of
 * published products (`DEFAULT_PER_PAGE`), each with two photos, made through
 * the seller API, the media pipeline and the listing refresh as a seller's
 * would be. The photos are synthetic, sized like product photos (about 20,
 * 50, 100 and 165 KB of WebP at 320, 640, 1024 and 1600 px), and go through
 * `processUpload` into the public bucket of an S3 server, which serves them
 * to the browser at `MEDIA_PUBLIC_URL`.
 *
 * The suite commits, and its rows stay for the Lighthouse run that follows
 * (scripts/run_lighthouse.mjs, the Lighthouse job of ci.yml); the next test
 * run rebuilds the database. The S3 server is the development one of
 * docker/seaweedfs/s3.json, on the test buckets, as in T-MED-005: without a
 * server on S3_CONTRACT_ENDPOINT (default http://127.0.0.1:8333) the test is
 * skipped, unless PERF_CATALOGUE_REQUIRED=1, as in CI, where it fails.
 */

const ENDPOINT = process.env.S3_CONTRACT_ENDPOINT ?? 'http://127.0.0.1:8333'
const REQUIRED = process.env.PERF_CATALOGUE_REQUIRED === '1'
const BUCKETS = { private: 'dripnepal-test-private', public: 'dripnepal-test-public' }
const CTX = { requestId: 'req-t-perf-003', timeoutMs: 30_000 }
const PHOTOS = 2
const SIZE = 1600

const reachable = await fetch(`${ENDPOINT}/healthz`, { signal: AbortSignal.timeout(1500) }).then(
  (response) => response.ok,
  () => false
)
const SKIP_REASON = `no S3 server at ${ENDPOINT}: docker compose up -d seaweedfs`

// Men's products whose categories need no size axis (06_category_attributes_seeder), so one variant each.
const SHAPES = [
  { category: 'backpacks', material: 'canvas', noun: 'daypack', price: 349_900 },
  { category: 'analog-watches', material: 'nylon', noun: 'field watch', price: 489_900 },
  { category: 'wallets', material: 'leather', noun: 'bifold wallet', price: 129_900 },
  { category: 'caps-hats', material: 'cotton', noun: 'cap', price: 89_900 },
] as const
const ADJECTIVES = ['Everyday', 'Heritage', 'Trail', 'Studio', 'Monsoon', 'Himalayan']

// An RGB colour of a hue, at a saturation and lightness between 0 and 1.
function rgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const k = (n: number) => (n + hue / 30) % 12
  const a = saturation * Math.min(lightness, 1 - lightness)
  const f = (n: number) => lightness - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
}

// Inside the garment: a body, shoulders and two sleeves.
const garment = (x: number, y: number) =>
  (x >= 540 && x < 1060 && y >= 560 && y < 1400) ||
  (x >= 440 && x < 1160 && y >= 300 && y < 600) ||
  (x >= 330 && x < 1270 && y >= 380 && y < 640)

/*
 * A square product photo: a gradient, a garment-like shape and a soft
 * texture. It is drawn as raw pixels, because the media codec blocks every
 * loader but the JPEG, PNG and WebP buffers in this process (T-SEC-018).
 */
async function photo(hue: number): Promise<Buffer> {
  const [from, to, cloth] = [rgb(hue, 0.25, 0.88), rgb(hue + 30, 0.2, 0.7), rgb(hue, 0.4, 0.32)]
  const pixels = Buffer.alloc(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const t = (x + y) / (2 * SIZE)
      const i = (y * SIZE + x) * 3
      for (let c = 0; c < 3; c++) {
        pixels[i + c] = garment(x, y) ? cloth[c] : Math.round(from[c] + (to[c] - from[c]) * t)
      }
    }
  }
  const texture = async (size: number, sigma: number) =>
    sharp({
      create: {
        width: size,
        height: size,
        channels: 3,
        // sharp's types ask for a background, which the noise replaces.
        background: '#808080',
        noise: { type: 'gaussian', mean: 128, sigma },
      },
    })
      .resize(SIZE, SIZE, { kernel: 'cubic' })
      .png()
      .toBuffer()
  return sharp(pixels, { raw: { width: SIZE, height: SIZE, channels: 3 } })
    .composite([
      { input: await texture(160, 60), blend: 'soft-light' },
      { input: await texture(SIZE, 6), blend: 'soft-light' },
    ])
    .jpeg({ quality: 85 })
    .toBuffer()
}

// One photo, uploaded and processed as `completeMediaUpload` and the worker would: `ready`.
async function readyPhoto(w: World, storage: ObjectStorage, hue: number): Promise<string> {
  const body = await photo(hue)
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: w.shop.shopId,
      kind: 'product_image',
      status: 'processing',
      original_key: 'pending',
      mime: 'image/jpeg',
      bytes: body.length,
      upload_etag: '"pending"',
      upload_bytes: body.length,
      uploaded_by: w.shop.ownerId,
    })
    .returning('id')
  const id = row.id as string
  const key = uploadKey(w.shop.shopId, id)
  await storage.put('private', key, body, { contentType: 'image/jpeg' }, CTX)
  const stored = await storage.head('private', key, CTX)
  if (!stored) throw new Error(`the S3 server lost ${key}`)
  await db
    .from('media_assets')
    .where('id', id)
    .update({ original_key: key, upload_etag: stored.etag })
  await processUpload({ media_asset_id: id, request_id: CTX.requestId, causation_id: null })
  const processed = await db.from('media_assets').where('id', id).firstOrFail()
  if (processed.status !== 'ready') throw new Error(`photo ${id} is ${processed.status}`)
  return id
}

async function publishedProduct(w: World, storage: ObjectStorage, n: number) {
  const shape = SHAPES[n % SHAPES.length]
  const title = `${ADJECTIVES[n % ADJECTIVES.length]} ${shape.noun} ${n + 1}`
  const created = await create(
    w,
    await draftBody({
      title,
      description: `${title}: made in Nepal, for everyday wear.`,
      category_id: await categoryId(shape.category),
      attributes: [
        { attribute_code: 'audience', value_codes: ['men'] },
        { attribute_code: 'material', value_codes: [shape.material] },
      ],
      warranty_text: '6 months',
    })
  )
  if (created.status !== 201) throw new Error(`create: ${created.text}`)
  const productId = created.body.data.id as string
  const path = productPath(w.shop.slug, productId)
  const variants = await send(
    w.owner,
    'PUT',
    `${path}/variants`,
    {
      option_axes: [],
      variants: [
        {
          option_value_codes: {},
          sku: `PERF-${randomUUID().slice(0, 8)}`,
          price_minor: shape.price + (n % 4) * 10_000,
        },
      ],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  await db
    .from('inventory_items')
    .where('variant_id', variants.body.data.variants[0].id as string)
    .update({ on_hand: 10 })
  const items = []
  for (let position = 1; position <= PHOTOS; position++) {
    const hue = (n * 37 + position * 15) % 360
    items.push({
      media_asset_id: await readyPhoto(w, storage, hue),
      position,
      alt_text: `${title}, photo ${position}`,
    })
  }
  const media = await send(w.owner, 'PUT', `${path}/media`, { items }, { 'If-Match': '"2"' })
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  const published = await act(w, productId, 'publish')
  if (published.status !== 200) throw new Error(`publish: ${published.text}`)
  // No worker runs here: the listing row is written as `catalog.refresh_listing` would.
  await refreshListing({ product_id: productId })
}

test.group('T-PERF-003 the launch catalogue for the Lighthouse run', (group) => {
  let restore = () => {}
  group.setup(() => {
    if (REQUIRED && !reachable) throw new Error(`PERF_CATALOGUE_REQUIRED=1 but ${SKIP_REASON}`)
    const quiet = { info: () => {}, warn: () => {} } as unknown as Logger
    const client = s3ClientFor({
      endpoint: ENDPOINT,
      region: 'auto',
      accessKeyId: 'dripnepal-dev',
      secretAccessKey: 'dripnepal-dev-secret',
    })
    app.container.swap(ObjectStorage, () => new S3ObjectStorage(client, BUCKETS, quiet))
    restore = () => app.container.restore(ObjectStorage)
    return () => restore()
  })

  test('T-PERF-003 one listing page of published products, with photos the public bucket serves', async ({
    assert,
  }) => {
    // The seller API sends its jobs in the same transaction (ADR-0010); nothing works them here.
    await useJobBoss()
    const storage = await app.container.make(ObjectStorage)
    const w = await world()
    await configureShipping(w)
    for (let n = 0; n < DEFAULT_PER_PAGE; n++) await publishedProduct(w, storage, n)

    const listed = await db
      .from('product_listings')
      .where('shop_slug', w.shop.slug)
      .select('primary_image_keys')
    assert.lengthOf(listed, DEFAULT_PER_PAGE)
    // A listed photo is served without credentials, as the browser will fetch it.
    const keys = Object.values(listed[0].primary_image_keys as Record<string, string>)
    assert.isAbove(keys.length, 0)
    const served = await fetch(`${ENDPOINT}/${BUCKETS.public}/${keys[0]}`)
    assert.equal(served.status, 200)
    assert.equal(served.headers.get('content-type'), 'image/webp')
  })
    .skip(!reachable && !REQUIRED, SKIP_REASON)
    .timeout(300_000)
})
