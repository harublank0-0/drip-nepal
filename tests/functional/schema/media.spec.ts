import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'
import { insertShop, insertUser, productValues, refused } from '#tests/support/schema_rows'

/*
 * `product_media`'s composite keys (docs/04a §7.14), with rows inserted
 * directly, as a bug in a new endpoint would:
 *
 * - T-MED-101: an asset of another shop is refused with 23503
 *   (`product_media_asset_fkey` on `(media_asset_id, shop_id, media_kind)`),
 *   so a gallery can only show its own shop's images.
 * - T-MED-102: a `kyc_document` of the same shop is refused with 23503 by
 *   the same key, since `media_kind` can only be `product_image`
 *   (`product_media_media_kind_check`): a KYC file, which may be a
 *   citizenship card, can never reach a public gallery.
 */

async function insertAsset(shopId: string, kind: 'product_image' | 'kyc_document') {
  const [row] = await db
    .table('media_assets')
    .insert({
      shop_id: shopId,
      kind,
      ...(kind === 'kyc_document' ? { document_type: 'owner_identity_document' } : {}),
      status: 'pending_upload',
      original_key: `originals/${shopId}/x`,
      mime: 'image/jpeg',
      bytes: 2048,
      uploaded_by: await insertUser(),
    })
    .returning('id')
  return row.id as string
}

async function insertProduct(shopId: string) {
  const [row] = await db
    .table('products')
    .insert(await productValues(shopId))
    .returning('id')
  return row.id as string
}

test.group('T-MED-101 T-MED-102 product_media keys', () => {
  test('T-MED-101 an asset of another shop cannot be product media', async ({ assert }) => {
    const shop = await insertShop()
    const otherShop = await insertShop()
    const product = await insertProduct(shop)
    const foreign = await insertAsset(otherShop, 'product_image')
    await refused(
      assert,
      (trx) =>
        trx
          .table('product_media')
          .insert({ product_id: product, shop_id: shop, media_asset_id: foreign, position: 1 }),
      { code: '23503', constraint: 'product_media_asset_fkey' },
      'another shop’s asset'
    )
    // Claiming the asset's shop instead breaks the product's key.
    await refused(
      assert,
      (trx) =>
        trx.table('product_media').insert({
          product_id: product,
          shop_id: otherShop,
          media_asset_id: foreign,
          position: 1,
        }),
      { code: '23503', constraint: 'product_media_product_fkey' },
      'the asset’s shop on another shop’s product'
    )
    // The control: the shop's own image is accepted.
    const own = await insertAsset(shop, 'product_image')
    await db
      .table('product_media')
      .insert({ product_id: product, shop_id: shop, media_asset_id: own, position: 1 })
    assert.lengthOf(await db.from('product_media').where('product_id', product), 1)
  })

  test('T-MED-102 a kyc_document can never be product media', async ({ assert }) => {
    const shop = await insertShop()
    const product = await insertProduct(shop)
    const kyc = await insertAsset(shop, 'kyc_document')
    await refused(
      assert,
      (trx) =>
        trx
          .table('product_media')
          .insert({ product_id: product, shop_id: shop, media_asset_id: kyc, position: 1 }),
      { code: '23503', constraint: 'product_media_asset_fkey' },
      'a KYC document'
    )
    await refused(
      assert,
      (trx) =>
        trx.table('product_media').insert({
          product_id: product,
          shop_id: shop,
          media_asset_id: kyc,
          media_kind: 'kyc_document',
          position: 1,
        }),
      { code: '23514', constraint: 'product_media_media_kind_check' },
      'the KYC kind claimed'
    )
  })
})
