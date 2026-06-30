import factory from '@adonisjs/lucid/factories'
import Shop from '#models/shop'
import { ShopStatusValues } from '#constants/shop_status'

export const ShopFactory = factory
  .define(Shop, async ({ faker }) => {
    const name = faker.company.name()
    return {
      name,
      slug: faker.helpers.slugify(name),
      description: faker.company.catchPhraseDescriptor(),
      logo: faker.image.avatar(),
      banner: faker.image.urlPicsumPhotos(),
      email: faker.internet.email(),
      phone: faker.phone.number({ style: 'international' }),
      status: faker.helpers.arrayElement(ShopStatusValues),
    }
  })
  .build()
