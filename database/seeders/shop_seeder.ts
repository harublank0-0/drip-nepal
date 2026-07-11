import { ProductFactory } from '#database/factories/product_factory'
import { ShopFactory } from '#database/factories/shop_factory'
import { UserFactory } from '#database/factories/user_factory'
import Category from '#models/category'
import User from '#models/user'
import { random } from '#utils/random'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

export default class extends BaseSeeder {
  async run() {
    const existing = await User.findBy('email', 'demo@dripnepal.com')
    if (existing) return

    const user = await UserFactory.merge({
      fullName: 'Demo Vendor',
      email: 'demo@dripnepal.com',
      password: 'dripnepal',
      status: 'active',
    }).create()

    const shop = await ShopFactory.merge({
      ownerId: user.id,
      name: 'Drip Nepal Demo',
      slug: 'dripnepal-demo',
      status: 'active',
    }).create()

    const categories = await Category.all()
    if (categories.length > 0) {
      await ProductFactory.merge({
        shopId: shop.id,
        categoryId: categories[random(0, categories.length - 1)].id,
      }).createMany(10)
    }
  }
}
