import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import { ShopFactory } from '#database/factories/shop_factory'

/*
 * Storefront listing fixtures (R1-S part 3b, 3d): an active shop, and
 * `product_listings` rows written directly with exact prices, dates and
 * value IDs, on factory products for the foreign key, as
 * `catalog.refresh_listing` writes them (T-CAT-012 tests how it does).
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

// A seeded category, with its names along the path, root first, as the listing row holds them.
export async function categoryRow(slug: string) {
  const row = await db.from('categories').where('slug', slug).select('id', 'path').firstOrFail()
  const names = await db
    .from('categories')
    .whereRaw('? LIKE path || ?', [row.path, '%'])
    .orderBy('depth')
    .select('name')
  return {
    id: row.id as string,
    path: row.path as string,
    names: names.map((name) => name.name as string).join(' '),
  }
}

export type Shop = { id: string; slug: string; name: string }

export async function activeShop(): Promise<Shop> {
  const shop = await ShopFactory.apply('active').create()
  return { id: shop.id, slug: shop.slug, name: shop.name }
}

export type Listed = { productId: string; publicId: string; slug: string; title: string }

// One listed product: a factory product, and its listing row as `catalog.refresh_listing` writes it.
export async function listed(
  shop: Shop,
  values: {
    title: string
    category?: string
    brand?: { id: string; name: string; slug: string } | null
    audience?: string[]
    sizes?: string[]
    colors?: string[]
    min?: number
    max?: number
    compareAt?: number | null
    inStock?: boolean
    publishedAt?: string
  }
): Promise<Listed> {
  const category = await categoryRow(values.category ?? 't-shirts')
  const product = await ProductFactory.merge({
    shopId: shop.id,
    categoryId: category.id,
    title: values.title,
  })
    .apply('published')
    .create()
  const min = values.min ?? 129900
  await db.table('product_listings').insert({
    product_id: product.id,
    shop_id: shop.id,
    shop_slug: shop.slug,
    shop_name: shop.name,
    public_id: product.publicId,
    slug: product.slug,
    title: values.title,
    category_id: category.id,
    category_path: category.path,
    category_names: category.names,
    brand_id: values.brand?.id ?? null,
    brand_name: values.brand?.name ?? null,
    brand_slug: values.brand?.slug ?? null,
    audience_value_ids: `{${(values.audience ?? []).join(',')}}`,
    size_value_ids: `{${(values.sizes ?? []).join(',')}}`,
    color_value_ids: `{${(values.colors ?? []).join(',')}}`,
    min_price_minor: min,
    max_price_minor: values.max ?? min,
    compare_at_price_minor: values.compareAt ?? null,
    in_stock: values.inStock ?? true,
    primary_image_keys: JSON.stringify({ 320: `p/${product.id}/abc-320.webp` }),
    primary_image_alt: `${values.title}, front`,
    published_at: values.publishedAt ?? '2026-11-01T00:00:00Z',
  })
  return {
    productId: product.id,
    publicId: product.publicId,
    slug: product.slug,
    title: values.title,
  }
}
