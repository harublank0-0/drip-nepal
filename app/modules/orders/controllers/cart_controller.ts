import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import CartService from '#modules/orders/services/cart_service'
import { cartOwner } from '#modules/orders/customer'
import { addToCartValidator, updateCartItemValidator } from '#modules/orders/validators/cart'
import CartSummaryTransformer from '#transformers/cart_summary_transformer'

/*
 * The cart of a logged-in user, or of a guest (kept by a token in their
 * session).
 */
@inject()
export default class CartController {
  constructor(protected cart: CartService) {}

  async show(ctx: HttpContext) {
    const items = await this.cart.items(cartOwner(ctx))

    return ctx.inertia.render('commerce/cart/index', {
      cart: CartSummaryTransformer.transform(this.cart.summarize(items)),
    })
  }

  async store(ctx: HttpContext) {
    const { variantId, quantity } = await ctx.request.validateUsing(addToCartValidator)
    await this.cart.add(cartOwner(ctx, { create: true })!, variantId, quantity)

    ctx.session.flash('success', 'Added to your cart')
    return ctx.response.redirect().back()
  }

  async update(ctx: HttpContext) {
    const { quantity } = await ctx.request.validateUsing(updateCartItemValidator)
    await this.cart.update(cartOwner(ctx), ctx.params.id, quantity)

    return ctx.response.redirect().back()
  }

  async destroy(ctx: HttpContext) {
    await this.cart.remove(cartOwner(ctx), ctx.params.id)
    return ctx.response.redirect().back()
  }
}
