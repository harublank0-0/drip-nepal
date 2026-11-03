import User from '#models/user'
import Shop from '#models/shop'
import ShopAddress from '#models/shop_address'
import { shopSignupValidator } from '#modules/shops/validators/shop'
import { ShopAddressTypes } from '#constants/shop_address_type'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { signIn } from '#modules/auth/account_access'
import {
  clientNetwork,
  consumeOrReject,
  limiterKey,
  signupNetworkLimiter,
} from '#modules/auth/rate_limits'
import { ShopStatus } from '#constants/shop_status'

export default class ShopRegistrationController {
  /*
   * Renders the shop registration form. The owner is logged in after
   * registering and lands back here with `?success=1` to see the success
   * screen; any other logged-in visit goes home.
   */
  async create({ inertia, auth, request, response }: HttpContext) {
    if (auth.isAuthenticated && request.qs().success !== '1') {
      return response.redirect().toRoute('home')
    }

    return inertia.render('shops/register/index', {})
  }

  /*
   * Creates the owner account, the shop and its address in one transaction,
   * then logs the owner in.
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    await consumeOrReject(
      signupNetworkLimiter(),
      limiterKey('signup:ip', clientNetwork(request.ip())),
      'email'
    )
    const data = await request.validateUsing(shopSignupValidator)
    const registration = await db.transaction(async (trx) => {
      const newUser = await User.create(
        {
          fullName: data.fullName,
          email: data.email,
          password: data.password,
          phone: data.phone,
        },
        {
          client: trx,
        }
      )

      const shop = await Shop.create(
        {
          name: data.shopName,
          slug: data.shopSlug,
          email: data.email,
          phone: data.phone,
          description: data.description ?? null,
          ownerId: newUser.id,
          status: ShopStatus.PENDING,
        },
        { client: trx }
      )

      shop.useTransaction(trx)
      await shop.related('shopCategories').attach(data.categories)

      await ShopAddress.create(
        {
          shopId: shop.id,
          label: 'Default',
          address: data.address,
          city: data.city,
          district: data.district,
          province: data.province,
          type: ShopAddressTypes.PRIMARY,
          isDefault: true,
        },
        { client: trx }
      )

      return { user: newUser, shop }
    })

    await signIn(ctx, registration.user)

    return response.redirect().toRoute('ui.auth.shop.shop_registration.create', [], {
      qs: { success: 1, shop: registration.shop.slug },
    })
  }
}
