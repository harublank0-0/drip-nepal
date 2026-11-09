import { DateTime } from 'luxon'
import factory from '@adonisjs/lucid/factories'
import Product from '#models/product'
import type { ProductStatus } from '#modules/catalog/domain/product_status'
import type { VariantStatus } from '#modules/catalog/domain/variant_status'
import { ShopFactory } from '#database/factories/shop_factory'

/*
 * Products (docs/04a §7.6) for tests and development seeders (docs/04
 * §20.3). The aggregate is created whole: every product gets its default
 * variant (`option_signature = ''`, docs/04 §3.4) and that variant's
 * `inventory_items` row with no stock (docs/04a §8.1). Without a merged
 * `shopId` the product belongs to a new pending shop; without a
 * `categoryId` it goes in the seeded leaf `t-shirts` (docs/04 §21.1), so
 * the reference seeders must have run, as they have in every test run
 * (docs/10 §3.2).
 *
 * The default is a `draft`. State `published` adds the disclosures that
 * `products_disclosures_check` requires of a live product (FR-CAT-012) and
 * the publish timestamps.
 */

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const DEFAULT_CATEGORY_SLUG = 't-shirts'

const status = (value: ProductStatus) => value
const variantStatus = (value: VariantStatus) => value

export const ProductFactory = factory
  .define(Product, ({ faker }) => {
    const title = faker.commerce.productName().slice(0, 120)
    return {
      publicId: faker.string.fromCharacters(CROCKFORD, 8),
      title,
      slug:
        title
          .toLowerCase()
          .replaceAll(/[^a-z0-9]+/g, '-')
          .replaceAll(/^-|-$/g, '') || 'product',
      status: status('draft'),
    }
  })
  .state('published', (product) => {
    const now = DateTime.now()
    product.merge({
      status: status('published'),
      description: 'Hand-stitched cotton, made in Kathmandu.',
      manufacturerName: 'Thulo Pasal Garments',
      warrantyText: 'No warranty',
      careAndPrecautions: 'Hand wash cold; dry in shade.',
      countryOfOrigin: 'NP',
      isImported: false,
      publishedAt: now,
      firstPublishedAt: now,
    })
  })
  .before('create', async (_, product, ctx) => {
    if (!product.shopId) {
      const shop = await ShopFactory.useCtx(ctx).create()
      product.shopId = shop.id
      product.createdBy ??= shop.ownerUserId
    }
    if (!product.createdBy) {
      const shop = await ctx.$trx!.from('shops').select('owner_user_id').where('id', product.shopId)
      product.createdBy = shop[0].owner_user_id
    }
    if (!product.categoryId) {
      const category = await ctx
        .$trx!.from('categories')
        .select('id')
        .where('slug', DEFAULT_CATEGORY_SLUG)
      if (category.length === 0) {
        throw new Error(
          `category ${DEFAULT_CATEGORY_SLUG} is not seeded; run the reference seeders`
        )
      }
      product.categoryId = category[0].id
    }
  })
  .after('create', async (_, product, ctx) => {
    const [variant] = await ctx
      .$trx!.insertQuery()
      .table('product_variants')
      .insert({
        shop_id: product.shopId,
        product_id: product.id,
        sku: `F-${product.publicId}`,
        price_minor: ctx.faker.number.int({ min: 10_000, max: 1_000_000 }),
        is_default: true,
        option_signature: '',
        status: variantStatus('active'),
      })
      .returning('id')
    await ctx.$trx!.insertQuery().table('inventory_items').insert({
      variant_id: variant.id,
      shop_id: product.shopId,
    })
  })
  .build()
