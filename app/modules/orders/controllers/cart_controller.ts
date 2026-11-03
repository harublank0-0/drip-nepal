import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import CartService from '#modules/orders/services/cart_service'
import { addToCartValidator, updateCartItemValidator } from '#modules/orders/validators/cart'
import CartSummaryTransformer from '#transformers/cart_summary_transformer'

@inject()
export default class CartController {
  constructor(protected cart: CartService) {}

  async show({ inertia, auth }: HttpContext) {
    const items = await this.cart.items(auth.getUserOrFail())

    return inertia.render('commerce/cart/index', {
      cart: CartSummaryTransformer.transform(this.cart.summarize(items)),
    })
  }

  async store({ request, response, session, auth }: HttpContext) {
    const { variantId, quantity } = await request.validateUsing(addToCartValidator)
    await this.cart.add(auth.getUserOrFail(), variantId, quantity)

    session.flash('success', 'Added to your cart')
    return response.redirect().back()
  }

  async update({ request, response, params, auth }: HttpContext) {
    const { quantity } = await request.validateUsing(updateCartItemValidator)
    await this.cart.update(auth.getUserOrFail(), params.id, quantity)

    return response.redirect().back()
  }

  async destroy({ response, params, auth }: HttpContext) {
    await this.cart.remove(auth.getUserOrFail(), params.id)
    return response.redirect().back()
  }
}
