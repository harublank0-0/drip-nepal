import db from '@adonisjs/lucid/services/db'
import type { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'
import Product from '#models/product'
import Shop from '#models/shop'
import { ShopStatus } from '#constants/shop_status'
import { ProductGender, ProductStatus, VariantAttributes, VariantStatus } from '#constants/product'

export type CatalogSort = 'newest' | 'price_asc' | 'price_desc'

export type CatalogFilters = {
  gender?: typeof ProductGender.MEN | typeof ProductGender.WOMEN
  categorySlug?: string
  shopId?: string
  search?: string
  sizes?: string[]
  colors?: string[]
  // Whole rupees, as in the listing's URL (`?min=1000&max=5000`).
  minRupees?: number
  maxRupees?: number
  sort?: CatalogSort
}

type ProductQuery = ModelQueryBuilderContract<typeof Product>

const SIZE_ORDER = ['xxs', 'xs', 's', 'm', 'l', 'xl', 'xxl', '2xl', '3xl', 'free-size']

/*
 * Letter sizes in wearing order, then numeric sizes ascending, then the rest.
 */
function compareSizes(a: { slug: string }, b: { slug: string }) {
  const rank = (slug: string) => {
    const letter = SIZE_ORDER.indexOf(slug)
    if (letter !== -1) return [0, letter]
    const number = Number(slug)
    return Number.isFinite(number) ? [1, number] : [2, 0]
  }
  const [groupA, valueA] = rank(a.slug)
  const [groupB, valueB] = rank(b.slug)
  return groupA - groupB || valueA - valueB || a.slug.localeCompare(b.slug)
}

const MIN_PRICE_SQL = `(select min(pv.price_minor) from product_variants pv where pv.product_id = products.id and pv.status = '${VariantStatus.ACTIVE}')`

/*
 * Everything the storefront reads. A product is listed when it is active,
 * not deleted, has at least one active variant, and its shop is active.
 */
export default class CatalogService {
  listedProducts(): ProductQuery {
    return Product.query()
      .where('products.status', ProductStatus.ACTIVE)
      .whereNull('products.deleted_at')
      .whereHas('shop', (shop) => shop.where('status', ShopStatus.ACTIVE).whereNull('deleted_at'))
      .whereHas('variants', (variants) => variants.where('status', VariantStatus.ACTIVE))
  }

  /*
   * What a product card needs: up to two photos, active variants for the
   * price, the shop and the category.
   */
  withCardRelations(query: ProductQuery): ProductQuery {
    return query
      .preload('media', (media) => media.orderBy('sort_order', 'asc'))
      .preload('variants', (variants) => variants.where('status', VariantStatus.ACTIVE))
      .preload('shop')
      .preload('category')
  }

  /*
   * Applies the scope filters (gender, category, shop, search). Facets are
   * computed from this scope so they don't disappear as the user filters.
   */
  applyScope(query: ProductQuery, filters: CatalogFilters): ProductQuery {
    if (filters.gender) {
      query.whereIn('products.gender', [filters.gender, ProductGender.UNISEX])
    }

    if (filters.categorySlug) {
      query.whereHas('category', (category) => category.where('slug', filters.categorySlug!))
    }

    if (filters.shopId) {
      query.where('products.shop_id', filters.shopId)
    }

    if (filters.search) {
      const term = `%${filters.search}%`
      query.where((search) => {
        search
          .whereILike('products.name', term)
          .orWhereILike('products.brand', term)
          .orWhereILike('products.description', term)
          .orWhereHas('category', (category) => category.whereILike('name', term))
          .orWhereHas('shop', (shop) => shop.whereILike('name', term))
      })
    }

    return query
  }

  /*
   * Applies the refinement filters (size, color, price) and the sort.
   */
  applyRefinements(query: ProductQuery, filters: CatalogFilters): ProductQuery {
    const optionFilter = (attributeSlug: string, valueSlugs: string[] | undefined) => {
      if (!valueSlugs?.length) return
      query.whereHas('variants', (variants) =>
        variants
          .where('status', VariantStatus.ACTIVE)
          .whereHas('attributeValues', (values) =>
            values
              .whereIn('attribute_values.slug', valueSlugs)
              .whereHas('attribute', (attribute) => attribute.where('slug', attributeSlug))
          )
      )
    }

    optionFilter(VariantAttributes.SIZE.slug, filters.sizes)
    optionFilter(VariantAttributes.COLOR.slug, filters.colors)

    // Prices are paisa (docs/04 §18.1).
    if (filters.minRupees !== undefined) {
      query.whereRaw(`${MIN_PRICE_SQL} >= ?`, [filters.minRupees * 100])
    }

    if (filters.maxRupees !== undefined) {
      query.whereRaw(`${MIN_PRICE_SQL} <= ?`, [filters.maxRupees * 100])
    }

    switch (filters.sort) {
      case 'price_asc':
        query.orderByRaw(`${MIN_PRICE_SQL} asc`)
        break
      case 'price_desc':
        query.orderByRaw(`${MIN_PRICE_SQL} desc`)
        break
      default:
        query.orderBy('products.created_at', 'desc')
    }

    return query
  }

  async list(filters: CatalogFilters, page: number, perPage = 24) {
    const query = this.listedProducts()
    this.applyScope(query, filters)
    this.applyRefinements(query, filters)
    this.withCardRelations(query)
    return query.paginate(page, perPage)
  }

  /*
   * Sizes, colors, categories and price bounds available in the scope.
   */
  async facets(filters: CatalogFilters) {
    const scopedProducts = await this.applyScope(this.listedProducts(), filters).select(
      'products.id'
    )
    const productIds = scopedProducts.map((product) => product.id)

    if (productIds.length === 0) {
      return { sizes: [], colors: [], categories: [], price: { minRupees: 0, maxRupees: 0 } }
    }

    const options = await db
      .from('attribute_values')
      .join('attributes', 'attributes.id', 'attribute_values.attribute_id')
      .join(
        'product_variant_attribute_values as pvav',
        'pvav.attribute_value_id',
        'attribute_values.id'
      )
      .join('product_variants as pv', 'pv.id', 'pvav.product_variant_id')
      .whereIn('pv.product_id', productIds)
      .where('pv.status', VariantStatus.ACTIVE)
      .distinct('attributes.slug as attribute', 'attribute_values.slug', 'attribute_values.value')
      .orderBy('attribute_values.value', 'asc')

    const categories = await db
      .from('categories')
      .join('products', 'products.category_id', 'categories.id')
      .whereIn('products.id', productIds)
      .groupBy('categories.id', 'categories.name', 'categories.slug')
      .select('categories.name', 'categories.slug')
      .count('products.id as productCount')
      .orderBy('categories.name', 'asc')

    const price = await db
      .from('product_variants')
      .whereIn('product_id', productIds)
      .where('status', VariantStatus.ACTIVE)
      .min('price_minor as min')
      .max('price_minor as max')
      .first()

    const toOption = (row: { slug: string; value: string }) => ({
      slug: row.slug,
      label: row.value,
    })

    return {
      sizes: options
        .filter((row) => row.attribute === VariantAttributes.SIZE.slug)
        .sort(compareSizes)
        .map(toOption),
      colors: options.filter((row) => row.attribute === VariantAttributes.COLOR.slug).map(toOption),
      categories: categories.map((row) => ({
        name: row.name as string,
        slug: row.slug as string,
        productCount: Number(row.productCount),
      })),
      // Whole rupees around the paisa prices, for the price filter.
      price: {
        minRupees: Math.floor((price?.min ?? 0) / 100),
        maxRupees: Math.ceil((price?.max ?? 0) / 100),
      },
    }
  }

  /*
   * Categories that have listed products, biggest first, for the home page.
   * The picture is the newest product's first photo, so it shows what the
   * shop actually sells; the category's own image is the fallback.
   */
  async homeCategories(limit = 8) {
    const listed = await this.listedProducts().select('products.id')
    const productIds = listed.map((product) => product.id)
    if (productIds.length === 0) return []

    const rows = await db
      .from('categories as c')
      .join('products as p', 'p.category_id', 'c.id')
      .whereIn('p.id', productIds)
      .where('c.is_active', true)
      .groupBy('c.id', 'c.name', 'c.slug', 'c.image')
      .select('c.name', 'c.slug', 'c.image')
      .select(
        db.raw(
          `(select coalesce(pm.thumbnail_url, pm.url) from product_media pm
              join products cp on cp.id = pm.product_id
             where cp.category_id = c.id and cp.id = any(?)
             order by cp.created_at desc, pm.sort_order asc nulls last
             limit 1) as cover`,
          [productIds]
        )
      )
      .count('p.id as productCount')
      .orderBy('productCount', 'desc')
      .orderBy('c.name', 'asc')
      .limit(limit)

    return rows.map((row) => ({
      name: row.name as string,
      slug: row.slug as string,
      image: (row.cover ?? row.image ?? null) as string | null,
      productCount: Number(row.productCount),
    }))
  }

  async newArrivals(limit = 8) {
    return this.withCardRelations(this.listedProducts())
      .orderBy('products.created_at', 'desc')
      .limit(limit)
  }

  async findListedBySlug(slug: string) {
    return this.listedProducts()
      .where('products.slug', slug)
      .preload('media', (media) => media.orderBy('sort_order', 'asc'))
      .preload('variants', (variants) =>
        variants
          .where('status', VariantStatus.ACTIVE)
          .orderBy('created_at', 'asc')
          .preload('attributeValues', (values) => values.preload('attribute'))
      )
      .preload('shop')
      .preload('category')
      .firstOrFail()
  }

  async related(product: Product, limit = 8) {
    return this.withCardRelations(this.listedProducts())
      .where('products.category_id', product.categoryId)
      .whereNot('products.id', product.id)
      .orderBy('products.created_at', 'desc')
      .limit(limit)
  }

  /*
   * Active shops with at least one listed product, newest first,
   * optionally filtered by name.
   */
  async featuredShops(limit = 6, nameSearch?: string) {
    const query = Shop.query()
    if (nameSearch) {
      query.whereILike('name', `%${nameSearch}%`)
    }

    return query
      .where('status', ShopStatus.ACTIVE)
      .whereNull('deleted_at')
      .whereHas('products', (products) =>
        products.where('status', ProductStatus.ACTIVE).whereNull('deleted_at')
      )
      .withCount('products', (products) =>
        products.where('status', ProductStatus.ACTIVE).whereNull('deleted_at')
      )
      .orderBy('created_at', 'desc')
      .limit(limit)
  }

  async findActiveShop(slug: string) {
    return Shop.query()
      .where('slug', slug)
      .where('status', ShopStatus.ACTIVE)
      .whereNull('deleted_at')
      .withCount('products', (products) =>
        products.where('status', ProductStatus.ACTIVE).whereNull('deleted_at')
      )
      .firstOrFail()
  }
}
