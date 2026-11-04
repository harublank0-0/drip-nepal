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
import { shopRegistrationOpen } from '#config/marketplace'
import { errors as lucidErrors } from '@adonisjs/lucid'

export default class ShopRegistrationController {
  /*
   * Renders the shop registration form. The owner is logged in after
   * registering and lands back here with `?success=1` to see the success
   * screen; any other logged-in visit goes home. The page gets the state
   * as props (not from the address bar), so the server render and the
   * browser render agree.
   */
  async create({ inertia, auth, request, response }: HttpContext) {
    if (!shopRegistrationOpen) throw new lucidErrors.E_ROW_NOT_FOUND()

    const success = auth.isAuthenticated && request.qs().success === '1'
    if (auth.isAuthenticated && !success) {
      return response.redirect().toRoute('home')
    }

    // The owner's newest shop, the one just registered.
    const shop = success
      ? await auth.user!.related('shops').query().orderBy('created_at', 'desc').first()
      : null
    return inertia.render('shops/register/index', { success, shopSlug: shop?.slug ?? null })
  }

  /*
   * Creates the owner account, the shop and its address in one transaction,
   * then logs the owner in.
   */
  async store(ctx: HttpContext) {
    const { request, response } = ctx
    if (!shopRegistrationOpen) throw new lucidErrors.E_ROW_NOT_FOUND()

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
