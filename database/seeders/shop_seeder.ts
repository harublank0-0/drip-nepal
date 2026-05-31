import { ProductFactory } from '#database/factories/product_factory'
import { ShopFactory } from '#database/factories/shop_factory'
import { UserFactory } from '#database/factories/user_factory'
import Category from '#models/category'
import User from '#models/user'
import { random } from '#utils/random'
import { BaseSeeder } from '@adonisjs/lucid/seeders'

const demoShopOwners = [
  {
    fullName: 'shop owner 1',
    email: 'shopowner1@dripnepal.com',
    password: 'shopowner1',
  },

  {
    fullName: 'shop owner 2',
    email: 'shopowner2@dripnepal.com',
    password: 'shopowner2',
  },
  {
    fullName: 'shop owner 3',
    email: 'shopowner3@dripnepal.com',
    password: 'shopowner3',
  },
]

export default class extends BaseSeeder {
  async run() {
    const owner = await User.findBy('email', 'shopowner1@dripnepal.com')
    if (!owner) {
      for (const demoShopOwner of demoShopOwners) {
        const user = await UserFactory.merge(demoShopOwner).create()
        const shop = await ShopFactory.merge({ ownerId: user.id }).create()

        const categories = await Category.all()
        await ProductFactory.merge({
          shopId: shop.id,
          categoryId: categories[random(0, categories.length)].id,
        }).createMany(50)
      }
    }
  }
}
