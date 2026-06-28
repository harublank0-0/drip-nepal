import User from '#models/user'
import Shop from '#models/shop'
import ShopAddress from '#models/shop_address'
import { shopSignupValidator } from '#validators/auth/shop'
import { ShopAddressTypes } from '#constants/shop_address_type'
import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { ShopStatus } from '#constants/shop_status'

export default class ShopRegistrationController {
  async create({ inertia, auth, response, request }: HttpContext) {
    const success = request.input('success')
    // const user = await auth.check()
    console.log({ user: 'alu', success })

    // if ((await auth.check()) && !success) {
    //   return response.redirect().toPath('/')
    // }
    //
    // return inertia.render('shops/register/index', {})
  }

  async store({ request, response, auth }: HttpContext) {
    // return response.redirect().toRoute('shops.shop_registrations.create', {
    //   data: { success: 1 },
    // })
    const data = await request.validateUsing(shopSignupValidator)

    const user = await db.transaction(async (trx) => {
      const user = await User.create(
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
          ownerId: user.id,
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

      return user
    })

    await auth.use('web').login(user)
    return response.redirect().toRoute('shops.shop_registrations.create', {
      data: { success: 1 },
    })
  }
}
