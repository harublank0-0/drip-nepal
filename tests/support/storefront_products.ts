import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { create, draftBody, productPath, type World } from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'

/*
 * Published storefront products made through the real draft, variants,
 * gallery and publish operations (R1-S parts 3c and 3d-ii), their stock
 * set on its rows; the shop's zone rates set through its shipping
 * operation. `T-CAT-016` reads them through `getProduct`, `T-UI-048`
 * through the product page.
 */
export async function valueId(attribute: string, code: string) {
  const row = await db
    .from('attribute_values as v')
    .join('attributes as a', 'a.id', 'v.attribute_id')
    .where({ 'a.code': attribute, 'v.code': code })
    .select('v.id')
    .firstOrFail()
  return row.id as string
}

export async function readyAsset(shopId: string, ownerId: string, width: number) {
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: shopId,
      kind: 'product_image',
      status: 'ready',
      original_key: `originals/${shopId}/${randomUUID()}/v1`,
      mime: 'image/jpeg',
      bytes: 2048,
      upload_etag: '"e"',
      upload_bytes: 2048,
      sha256: Buffer.alloc(32),
      processed_at: db.raw('now()'),
      derived_keys: JSON.stringify({ [width]: `p/x/abcdef0123456789-${width}.webp` }),
      width: 800,
      height: 800,
      uploaded_by: ownerId,
    })
    .returning('id')
  return row.id as string
}

export async function configureShipping(w: World) {
  const path = `/api/v1/seller/shops/${w.shop.slug}/shipping`
  const current = await send(w.owner, 'GET', path)
  const response = await send(
    w.owner,
    'PUT',
    path,
    {
      coverage: ['306', '405'],
      rates: [
        { zone_code: 'ktm_valley', fee_minor: 10000, est_min_days: 0, est_max_days: 1 },
        { zone_code: 'outside_valley', fee_minor: 15050, est_min_days: 2, est_max_days: 5 },
      ],
    },
    { 'If-Match': `"${current.body.data.version}"` }
  )
  if (response.status !== 200) throw new Error(`shipping: ${response.text}`)
}

export const act = (w: World, productId: string, operation: string) =>
  send(w.owner, 'POST', `${productPath(w.shop.slug, productId)}/${operation}`, {})

export type Made = { productId: string; publicId: string; variants: Map<string, string> }

/*
 * A published tee varying by colour and size: black M (3 in stock), black L
 * (none), white M (15). Two images: the first without alt text or colour,
 * the second for black with alt text.
 */
export async function publishedTee(w: World): Promise<Made> {
  await configureShipping(w)
  const created = await create(w, await draftBody({ warranty_text: 'No warranty' }))
  if (created.status !== 201) throw new Error(`create: ${created.text}`)
  const productId = created.body.data.id as string
  const publicId = created.body.data.public_id as string
  const suffix = randomUUID().slice(0, 6)
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/variants`,
    {
      // Size first: the answer still puts colour first (08 §11.2).
      option_axes: ['apparel_size', 'color'],
      variants: [
        {
          option_value_codes: { color: 'black', apparel_size: 'm' },
          sku: `BM-${suffix}`,
          price_minor: 129900,
          compare_at_price_minor: 159900,
        },
        {
          option_value_codes: { color: 'black', apparel_size: 'l' },
          sku: `BL-${suffix}`,
          price_minor: 139900,
        },
        {
          option_value_codes: { color: 'white', apparel_size: 'm' },
          sku: `WM-${suffix}`,
          price_minor: 129900,
        },
      ],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  const rows = await db
    .from('product_variants')
    .where({ product_id: productId, status: 'active' })
    .select('id', 'sku')
  const bySku = new Map(rows.map((row) => [(row.sku as string).slice(0, 2), row.id as string]))
  for (const [code, onHand] of [
    ['BM', 3],
    ['BL', 0],
    ['WM', 15],
  ] as const) {
    await db
      .from('inventory_items')
      .where('variant_id', bySku.get(code)!)
      .update({ on_hand: onHand })
  }
  // Black M: 1 of its 3 is reserved, so 2 are to sell.
  await db.from('inventory_items').where('variant_id', bySku.get('BM')!).update({ reserved: 1 })
  const first = await readyAsset(w.shop.shopId, w.shop.ownerId, 320)
  const second = await readyAsset(w.shop.shopId, w.shop.ownerId, 640)
  const media = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/media`,
    {
      // Sent out of order: the answer follows position.
      items: [
        {
          media_asset_id: second,
          position: 2,
          alt_text: 'Black tee, back',
          color_value_id: await valueId('color', 'black'),
        },
        { media_asset_id: first, position: 1, alt_text: null },
      ],
    },
    { 'If-Match': '"2"' }
  )
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  const published = await act(w, productId, 'publish')
  if (published.status !== 200) throw new Error(`publish: ${published.text}`)
  return { productId, publicId, variants: bySku }
}

/*
 * A published watch with no option axes (`analog-watches` asks for none):
 * its one default variant at `priceMinor`, `onHand` in stock, one image.
 */
export async function publishedPlain(
  w: World,
  options: { description?: string; priceMinor?: number; onHand?: number } = {}
): Promise<Made> {
  await configureShipping(w)
  const watches = await db.from('categories').where('slug', 'analog-watches').firstOrFail()
  const created = await create(
    w,
    await draftBody({
      category_id: watches.id,
      attributes: [
        { attribute_code: 'audience', value_codes: ['men'] },
        { attribute_code: 'material', value_codes: ['nylon'] },
      ],
      warranty_text: '1 year',
      ...(options.description ? { description: options.description } : {}),
    })
  )
  if (created.status !== 201) throw new Error(`create: ${created.text}`)
  const productId = created.body.data.id as string
  const publicId = created.body.data.public_id as string
  const variants = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/variants`,
    {
      option_axes: [],
      variants: [
        {
          option_value_codes: {},
          sku: `PL-${randomUUID().slice(0, 6)}`,
          price_minor: options.priceMinor ?? 129900,
        },
      ],
    },
    { 'If-Match': '"1"' }
  )
  if (variants.status !== 200) throw new Error(`variants: ${variants.text}`)
  const variantId = variants.body.data.variants[0].id as string
  await db
    .from('inventory_items')
    .where('variant_id', variantId)
    .update({ on_hand: options.onHand ?? 5 })
  const image = await readyAsset(w.shop.shopId, w.shop.ownerId, 320)
  const media = await send(
    w.owner,
    'PUT',
    `${productPath(w.shop.slug, productId)}/media`,
    { items: [{ media_asset_id: image, position: 1, alt_text: null }] },
    { 'If-Match': '"2"' }
  )
  if (media.status !== 200) throw new Error(`media: ${media.text}`)
  const published = await act(w, productId, 'publish')
  if (published.status !== 200) throw new Error(`publish: ${published.text}`)
  return { productId, publicId, variants: new Map([['PL', variantId]]) }
}
