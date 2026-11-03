import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import Category from '#models/category'
import ProductService from '#modules/products/services/product_service'
import { productValidator } from '#modules/shops/validators/product'
import { ProductStatusValues, type ProductStatus } from '#constants/product'
import CategoryTransformer from '#transformers/category_transformer'
import ProductTransformer from '#transformers/product_transformer'

@inject()
export default class ShopProductsController {
  constructor(protected productService: ProductService) {}

  /*
   * The shop's product list with search, status filter and pagination.
   */
  async index({ inertia, request, shop }: HttpContext) {
    const page = Math.max(1, Number(request.input('page', 1)) || 1)
    const search = String(request.input('search') ?? '').trim()
    const status = String(request.input('status') ?? '')

    const query = this.productService.shopProductsQuery(shop).orderBy('created_at', 'desc')

    if (search) {
      query.whereILike('name', `%${search}%`)
    }

    if (ProductStatusValues.includes(status as ProductStatus)) {
      query.where('status', status)
    }

    const products = await query.paginate(page, 20)

    return inertia.render('shops/dashboard/products/index', {
      products: ProductTransformer.paginate(products.all(), products.getMeta()),
      filters: { search, status },
    })
  }

  async create({ inertia }: HttpContext) {
    return inertia.render('shops/dashboard/products/form', {
      product: null,
      categories: CategoryTransformer.transform(await this.#categories()),
    })
  }

  async store({ request, response, session, shop }: HttpContext) {
    const payload = await request.validateUsing(productValidator)
    await this.productService.create(shop, payload)

    session.flash('success', 'Product created')
    return response.redirect().toRoute('ui.shops.shop_products.index', { shopSlug: shop.slug })
  }

  async edit({ inertia, params, shop }: HttpContext) {
    const product = await this.productService.findForShop(shop, params.id)

    return inertia.render('shops/dashboard/products/form', {
      product: ProductTransformer.transform(product),
      categories: CategoryTransformer.transform(await this.#categories()),
    })
  }

  async update({ request, response, params, session, shop }: HttpContext) {
    const product = await this.productService.findForShop(shop, params.id)
    const payload = await request.validateUsing(productValidator)
    await this.productService.update(shop, product, payload)

    session.flash('success', 'Product saved')
    return response.redirect().toRoute('ui.shops.shop_products.index', { shopSlug: shop.slug })
  }

  async destroy({ response, params, session, shop }: HttpContext) {
    const product = await this.productService.findForShop(shop, params.id)
    await this.productService.archive(product)

    session.flash('success', 'Product deleted')
    return response.redirect().toRoute('ui.shops.shop_products.index', { shopSlug: shop.slug })
  }

  #categories() {
    return Category.query().where('is_active', true).orderBy('name', 'asc')
  }
}
