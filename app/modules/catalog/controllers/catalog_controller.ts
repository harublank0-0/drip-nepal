import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import Category from '#models/category'
import CatalogService, {
  type CatalogFilters,
  type CatalogSort,
} from '#modules/catalog/services/catalog_service'
import { ProductGender } from '#constants/product'
import CategoryTransformer from '#transformers/category_transformer'
import ProductCardTransformer from '#transformers/product_card_transformer'
import ProductTransformer from '#transformers/product_transformer'
import StoreCardTransformer from '#transformers/store_card_transformer'

const SORTS: CatalogSort[] = ['newest', 'price_asc', 'price_desc']

function listParam(value: unknown): string[] {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '')
  return raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 20)
}

function priceParam(value: unknown): number | undefined {
  const number = Number(value)
  return value !== undefined && value !== null && value !== '' && Number.isFinite(number)
    ? Math.max(0, number)
    : undefined
}

@inject()
export default class CatalogController {
  constructor(protected catalog: CatalogService) {}

  async home({ inertia }: HttpContext) {
    const [newArrivals, featuredStores, categories] = await Promise.all([
      this.catalog.newArrivals(8),
      this.catalog.featuredShops(6),
      this.catalog.homeCategories(8),
    ])

    return inertia.render('customers/home/index', {
      newArrivals: ProductCardTransformer.transform(newArrivals),
      featuredStores: StoreCardTransformer.transform(featuredStores),
      categories,
    })
  }

  async men(ctx: HttpContext) {
    return this.#listing(
      ctx,
      { gender: ProductGender.MEN },
      {
        kind: 'men',
        title: 'Men',
        description: 'Streetwear, essentials and sneakers from local Nepali shops.',
      }
    )
  }

  async women(ctx: HttpContext) {
    return this.#listing(
      ctx,
      { gender: ProductGender.WOMEN },
      {
        kind: 'women',
        title: 'Women',
        description: 'Fits, layers and accessories from local Nepali shops.',
      }
    )
  }

  async category(ctx: HttpContext) {
    const category = await Category.query()
      .where('slug', ctx.params.slug)
      .where('is_active', true)
      .firstOrFail()

    return this.#listing(
      ctx,
      { categorySlug: category.slug },
      {
        kind: 'category',
        title: category.name,
        description: category.description ?? '',
        category: CategoryTransformer.transform(category),
      }
    )
  }

  async search(ctx: HttpContext) {
    const q = String(ctx.request.input('q') ?? '')
      .trim()
      .slice(0, 100)

    return this.#listing(
      ctx,
      { search: q || undefined },
      {
        kind: 'search',
        title: q ? `Results for “${q}”` : 'Search',
        description: '',
        query: q,
      }
    )
  }

  async store(ctx: HttpContext) {
    const shop = await this.catalog.findActiveShop(ctx.params.slug)

    return this.#listing(
      ctx,
      { shopId: shop.id },
      {
        kind: 'store',
        title: shop.name,
        description: shop.description ?? '',
        store: StoreCardTransformer.transform(shop),
      }
    )
  }

  async product({ inertia, params }: HttpContext) {
    const product = await this.catalog.findListedBySlug(params.slug)
    const related = await this.catalog.related(product, 8)

    return inertia.render('commerce/product_detail/index', {
      product: ProductTransformer.transform(product),
      related: ProductCardTransformer.transform(related),
    })
  }

  /*
   * JSON suggestions for the search modal: `{ data: { products, stores } }`.
   */
  async suggestions({ request, serialize }: HttpContext) {
    const q = String(request.input('q') ?? '')
      .trim()
      .slice(0, 100)
    if (q.length < 2) {
      return serialize({
        products: ProductCardTransformer.transform([]),
        stores: StoreCardTransformer.transform([]),
      })
    }

    const products = await this.catalog
      .withCardRelations(this.catalog.applyScope(this.catalog.listedProducts(), { search: q }))
      .orderBy('products.created_at', 'desc')
      .limit(6)

    const stores = await this.catalog.featuredShops(4, q)

    return serialize({
      products: ProductCardTransformer.transform(products),
      stores: StoreCardTransformer.transform(stores),
    })
  }

  async #listing(
    { inertia, request }: HttpContext,
    scope: CatalogFilters,
    context: {
      kind: 'men' | 'women' | 'category' | 'search' | 'store'
      title: string
      description: string
      query?: string
      category?: ReturnType<typeof CategoryTransformer.transform>
      store?: ReturnType<typeof StoreCardTransformer.transform>
    }
  ) {
    const sort = SORTS.includes(request.input('sort'))
      ? (request.input('sort') as CatalogSort)
      : 'newest'
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const category =
      context.kind === 'search'
        ? String(request.input('category') ?? '')
            .trim()
            .toLowerCase()
            .slice(0, 100) || undefined
        : undefined

    const filters: CatalogFilters = {
      ...scope,
      // Search categories refine the results; the query's facets stay available.
      ...(category ? { categorySlug: category } : {}),
      sizes: listParam(request.input('size')),
      colors: listParam(request.input('color')),
      minPrice: priceParam(request.input('min')),
      maxPrice: priceParam(request.input('max')),
      sort,
    }

    const [products, facets] = await Promise.all([
      this.catalog.list(filters, page),
      this.catalog.facets(scope),
    ])

    return inertia.render('commerce/listing/index', {
      context,
      products: ProductCardTransformer.paginate(products.all(), products.getMeta()),
      facets,
      filters: {
        ...(context.kind === 'search' ? { category: category ?? null } : {}),
        sizes: filters.sizes ?? [],
        colors: filters.colors ?? [],
        min: filters.minPrice ?? null,
        max: filters.maxPrice ?? null,
        sort,
      },
    })
  }
}
