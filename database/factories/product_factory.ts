import factory from '@adonisjs/lucid/factories'
import Product from '#models/product'
import { ShopStatusValues } from '#constants/shop_status'
import { random } from '#utils/random'

export const ProductFactory = factory
  .define(Product, async ({ faker }) => {
    const name = faker.company.name()
    return {
      name,
      slug: faker.helpers.slugify(name),
      description: faker.company.catchPhraseDescriptor(),
      status: faker.helpers.arrayElement(ShopStatusValues),
      brand: random(0, 1) ? faker.company.name() : null,
      isFeatured: Boolean(random(0, 1)),
    }
  })
  .build()
