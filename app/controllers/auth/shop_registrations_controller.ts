import User from '#models/user'
import Shop from '#models/shop'
import ShopAddress from '#models/shop_address'
import { shopSignupValidator } from '#validators/auth/shop'
import { ShopAddressTypes } from '#constants/shop_address_type'
import type { HttpContext } from '@adonisjs/core/http'

export default class ShopRegistrationController {
  async create({ inertia, auth, response, request }: HttpContext) {
    const success = request.input('success')

    if ((await auth.check()) && !success) {
      return response.redirect().toPath('/')
    }

    return inertia.render('shops/signup/index', {})
  }

  async store({ request, response, auth }: HttpContext) {
    const data = await request.validateUsing(shopSignupValidator)

    const user = await User.create({
      fullName: data.fullName,
      email: data.email,
      password: data.password,
      phone: data.phone,
    })

    const shop = await Shop.create({
      name: data.shopName,
      slug: data.shopSlug,
      email: data.email,
      phone: data.phone,
      description: data.description ?? null,
      category: data.category,
      ownerId: user.id,
      status: 'pending',
    })

    await ShopAddress.create({
      shopId: shop.id,
      label: 'Default',
      address: data.address,
      city: data.city,
      district: data.district,
      province: data.province,
      type: ShopAddressTypes.PRIMARY,
      isDefault: true,
    })

    await auth.use('web').login(user)

    return response.redirect().toPath('/shops/signup?success=1')
  }
}
