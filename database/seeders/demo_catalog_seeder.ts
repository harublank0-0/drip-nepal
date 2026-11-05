import app from '@adonisjs/core/services/app'
import { BaseSeeder } from '@adonisjs/lucid/seeders'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Attribute from '#models/attribute'
import AttributeValue from '#models/attribute_value'
import Category from '#models/category'
import Product from '#models/product'
import ProductMedia from '#models/product_media'
import ProductVariant from '#models/product_variant'
import { parseRupeesToMinor } from '#shared/format/money'
import Shop from '#models/shop'
import ShopAddress from '#models/shop_address'
import User from '#models/user'
import GlobalRole from '#models/global_role'
import { GlobalRoles } from '#constants/global_roles'
import { ShopStatus } from '#constants/shop_status'
import { ShopAddressTypes } from '#constants/shop_address_type'
import { ProductStatus, VariantAttributes, VariantStatus } from '#constants/product'

const photo = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=900&q=80&auto=format&fit=crop`

const PHOTOS = {
  streetwear: photo('1523398002811-999ca8dec234'),
  tee: photo('1521572163474-6864f9cf17ab'),
  hoodie: photo('1503342217505-b0a15ec3261c'),
  sneaker: photo('1542291026-7eec264c27ff'),
  jacket: photo('1515886657613-9f3515b0c78f'),
  cargo: photo('1542272604-787c3835535d'),
  watch: photo('1523170335258-f5ed11844a49'),
  bag: photo('1548036328-c9fa89d128fa'),
  accessories: photo('1512436991641-6745cdb1723f'),
  traditional: photo('1610030469983-98e550d6193c'),
  kurta: photo('1594633312681-425c7b97ccd1'),
  saree: photo('1617627143750-d86bc21e42bb'),
  women: photo('1496747611176-843222e1e57c'),
  men: photo('1500648767791-00dcc994a43e'),
}

/*
 * A demo price in rupees as paisa, by text as docs/04 §18.1 requires
 * (1299.99 * 100 is 129998.99999999999).
 */
function paisaOf(rupees: number) {
  const minor = parseRupeesToMinor(String(rupees))
  if (minor === null) throw new Error(`Demo price ${rupees} is not an amount in rupees`)
  return minor
}

type DemoProduct = {
  name: string
  category: string
  gender: 'men' | 'women' | 'unisex'
  brand?: string
  description: string
  photos: string[]
  // Whole rupees, for reading; stored as paisa.
  price: number
  comparePrice?: number
  sizes?: string[]
  colors?: string[]
}

const SHOPS: { name: string; slug: string; description: string; products: DemoProduct[] }[] = [
  {
    name: 'Thamel Threads',
    slug: 'thamel-threads',
    description: 'Streetwear and everyday basics, cut and printed in Kathmandu.',
    products: [
      {
        name: 'Heavyweight Oversized Hoodie',
        category: 'hoodies',
        gender: 'unisex',
        brand: 'Thamel Threads',
        description: '400 GSM brushed fleece, dropped shoulders and a double-lined hood.',
        photos: [PHOTOS.hoodie, PHOTOS.streetwear],
        price: 3200,
        comparePrice: 3800,
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Black', 'Grey'],
      },
      {
        name: 'Everyday Cotton Tee',
        category: 't-shirts',
        gender: 'unisex',
        brand: 'Thamel Threads',
        description: '180 GSM combed cotton tee with a relaxed fit.',
        photos: [PHOTOS.tee, PHOTOS.men],
        price: 1200,
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['White', 'Black'],
      },
      {
        name: 'Utility Cargo Pants',
        category: 'cargo-pants',
        gender: 'men',
        description: 'Six-pocket cargos in washed cotton twill with an adjustable hem.',
        photos: [PHOTOS.cargo, PHOTOS.streetwear],
        price: 3500,
        sizes: ['30', '32', '34', '36'],
        colors: ['Olive', 'Black'],
      },
      {
        name: 'Boxy Graphic Tee',
        category: 't-shirts',
        gender: 'men',
        brand: 'Thamel Threads',
        description: 'Screen-printed Kathmandu skyline on a boxy heavyweight tee.',
        photos: [PHOTOS.streetwear, PHOTOS.tee],
        price: 1600,
        comparePrice: 1900,
        sizes: ['M', 'L', 'XL'],
        colors: ['Black'],
      },
      {
        name: 'Coach Jacket',
        category: 'jackets',
        gender: 'unisex',
        description: 'Water-resistant nylon shell with snap front and mesh lining.',
        photos: [PHOTOS.jacket, PHOTOS.men],
        price: 5200,
        sizes: ['M', 'L', 'XL'],
        colors: ['Navy', 'Black'],
      },
      {
        name: 'Street Runner Sneakers',
        category: 'sneakers',
        gender: 'men',
        brand: 'Goldstar',
        description: 'Lightweight runners with a cushioned sole, made in Nepal.',
        photos: [PHOTOS.sneaker],
        price: 4500,
        comparePrice: 5000,
        sizes: ['40', '41', '42', '43', '44'],
        colors: ['Red'],
      },
      {
        name: 'Canvas Tote Bag',
        category: 'bags',
        gender: 'unisex',
        description: 'Heavy canvas tote with an inside zip pocket.',
        photos: [PHOTOS.bag],
        price: 1400,
      },
      {
        name: 'Ribbed Beanie',
        category: 'accessories',
        gender: 'unisex',
        description: 'Soft acrylic rib knit, one size.',
        photos: [PHOTOS.accessories],
        price: 800,
        colors: ['Black', 'Mustard'],
      },
    ],
  },
  {
    name: 'Patan Handloom',
    slug: 'patan-handloom',
    description: 'Handwoven dhaka, kurtas and sarees from weavers in Lalitpur.',
    products: [
      {
        name: 'Dhaka Print Kurta',
        category: 'kurtas',
        gender: 'women',
        description: 'Cotton kurta with handwoven dhaka panels and a straight cut.',
        photos: [PHOTOS.kurta, PHOTOS.traditional],
        price: 4200,
        sizes: ['S', 'M', 'L'],
        colors: ['Maroon', 'Indigo'],
      },
      {
        name: 'Handloom Cotton Saree',
        category: 'sarees',
        gender: 'women',
        description: 'Six yards of breathable handloom cotton with a contrast border.',
        photos: [PHOTOS.saree, PHOTOS.traditional],
        price: 7800,
        comparePrice: 8500,
        colors: ['Red', 'Mustard'],
      },
      {
        name: 'Daura Suruwal Set',
        category: 'traditional-wear',
        gender: 'men',
        description: 'Classic daura suruwal in fine cotton, tailored fit.',
        photos: [PHOTOS.traditional, PHOTOS.men],
        price: 6500,
        sizes: ['M', 'L', 'XL'],
        colors: ['Cream'],
      },
      {
        name: 'Dhaka Topi',
        category: 'accessories',
        gender: 'men',
        description: 'Handwoven dhaka topi, one size.',
        photos: [PHOTOS.traditional],
        price: 900,
      },
      {
        name: 'Embroidered Kurta Set',
        category: 'kurtas',
        gender: 'women',
        description: 'Kurta, pants and dupatta with thread embroidery at the yoke.',
        photos: [PHOTOS.women, PHOTOS.kurta],
        price: 5600,
        sizes: ['S', 'M', 'L', 'XL'],
        colors: ['Teal'],
      },
      {
        name: 'Silk Blend Saree',
        category: 'sarees',
        gender: 'women',
        description: 'Lightweight silk blend with zari border.',
        photos: [PHOTOS.saree],
        price: 9800,
        colors: ['Emerald', 'Gold'],
      },
      {
        name: 'Woven Shoulder Bag',
        category: 'bags',
        gender: 'women',
        description: 'Handloom fabric bag with a leather strap.',
        photos: [PHOTOS.bag, PHOTOS.traditional],
        price: 2200,
      },
      {
        name: 'Pashmina Shawl',
        category: 'accessories',
        gender: 'women',
        brand: 'Patan Handloom',
        description: 'Pure pashmina, hand-finished fringe.',
        photos: [PHOTOS.accessories, PHOTOS.women],
        price: 8500,
        comparePrice: 9500,
        colors: ['Beige', 'Charcoal'],
      },
    ],
  },
  {
    name: 'Pokhara Supply Co.',
    slug: 'pokhara-supply',
    description: 'Outdoor-ready layers, sneakers and watches for life by the lake.',
    products: [
      {
        name: 'Trail Puffer Jacket',
        category: 'jackets',
        gender: 'men',
        description: 'Synthetic insulation puffer that packs into its own pocket.',
        photos: [PHOTOS.jacket],
        price: 7800,
        comparePrice: 8900,
        sizes: ['M', 'L', 'XL'],
        colors: ['Black', 'Orange'],
      },
      {
        name: 'Lakeside Sneakers',
        category: 'sneakers',
        gender: 'women',
        description: 'Everyday canvas sneakers with a grippy sole.',
        photos: [PHOTOS.sneaker, PHOTOS.women],
        price: 3600,
        sizes: ['36', '37', '38', '39', '40'],
        colors: ['White'],
      },
      {
        name: 'Field Watch',
        category: 'watches',
        gender: 'unisex',
        description: 'Quartz field watch with a 38mm steel case and canvas strap.',
        photos: [PHOTOS.watch],
        price: 6400,
        colors: ['Green', 'Black'],
      },
      {
        name: 'Minimal Leather Watch',
        category: 'watches',
        gender: 'women',
        description: 'Slim 34mm case on a vegetable-tanned leather strap.',
        photos: [PHOTOS.watch, PHOTOS.women],
        price: 5900,
      },
      {
        name: 'Fleece Pullover',
        category: 'hoodies',
        gender: 'women',
        description: 'Polar fleece half-zip for chilly mornings.',
        photos: [PHOTOS.women, PHOTOS.hoodie],
        price: 3900,
        sizes: ['S', 'M', 'L'],
        colors: ['Cream', 'Sage'],
      },
      {
        name: 'Ripstop Cargo Shorts',
        category: 'cargo-pants',
        gender: 'men',
        description: 'Quick-dry ripstop shorts with cargo pockets.',
        photos: [PHOTOS.cargo],
        price: 2400,
        sizes: ['30', '32', '34'],
        colors: ['Khaki'],
      },
      {
        name: 'Day Hike Backpack',
        category: 'bags',
        gender: 'unisex',
        brand: 'Pokhara Supply',
        description: '22L backpack with a laptop sleeve and rain cover.',
        photos: [PHOTOS.bag, PHOTOS.streetwear],
        price: 4800,
      },
      {
        name: 'Relaxed Linen Shirt',
        category: 'women-fashion',
        gender: 'women',
        description: 'Breathable linen shirt with a relaxed drape.',
        photos: [PHOTOS.women],
        price: 2900,
        sizes: ['S', 'M', 'L'],
        colors: ['White', 'Sky'],
      },
    ],
  },
]

/*
 * Demo vendor, three approved shops and 24 products with variants and
 * photos, so the storefront has something to show in development. Also a
 * platform admin and one shop waiting for approval.
 *
 * Vendor login: demo@dripnepal.com / dripnepal
 * Admin login:  admin@dripnepal.com / dripnepal
 */
export default class extends BaseSeeder {
  static environment = ['development', 'test']

  async run() {
    await this.#ensureAdmin()
    await this.#ensurePendingShop()
    if (await Shop.findBy('slug', SHOPS[0].slug)) return

    await db.transaction(async (trx) => {
      const owner = await this.#ensureVendor(trx)

      const allCategories = await Category.all()
      const categories = new Map(allCategories.map((category) => [category.slug, category]))
      const size = await Attribute.firstOrCreate(
        { slug: VariantAttributes.SIZE.slug },
        VariantAttributes.SIZE,
        { client: trx }
      )
      const color = await Attribute.firstOrCreate(
        { slug: VariantAttributes.COLOR.slug },
        VariantAttributes.COLOR,
        { client: trx }
      )

      const valueIds = new Map<string, string>()
      const valueFor = async (attribute: Attribute, value: string) => {
        const key = `${attribute.id}:${value}`
        if (!valueIds.has(key)) {
          const row = await AttributeValue.firstOrCreate(
            { attributeId: attribute.id, slug: value.toLowerCase() },
            { value },
            { client: trx }
          )
          valueIds.set(key, row.id)
        }
        return valueIds.get(key)!
      }

      let skuCounter = 1
      for (const [shopIndex, demoShop] of SHOPS.entries()) {
        const shop = await Shop.create(
          {
            ownerId: owner.id,
            name: demoShop.name,
            slug: demoShop.slug,
            description: demoShop.description,
            email: `hello@${demoShop.slug}.example`,
            phone: `98000001${10 + shopIndex}`,
            status: ShopStatus.ACTIVE,
          },
          { client: trx }
        )

        await ShopAddress.create(
          {
            shopId: shop.id,
            label: 'Default',
            address: 'Main road',
            city: ['Kathmandu', 'Lalitpur', 'Pokhara'][shopIndex],
            district: ['Kathmandu', 'Lalitpur', 'Kaski'][shopIndex],
            province: ['Bagmati', 'Bagmati', 'Gandaki'][shopIndex],
            type: ShopAddressTypes.PRIMARY,
            isDefault: true,
          },
          { client: trx }
        )

        for (const [productIndex, demo] of demoShop.products.entries()) {
          const category = categories.get(demo.category)
          if (!category) throw new Error(`Run the category seeder first (${demo.category})`)

          const product = await Product.create(
            {
              shopId: shop.id,
              categoryId: category.id,
              name: demo.name,
              slug: `${demo.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${demoShop.slug.slice(0, 6)}`,
              description: demo.description,
              gender: demo.gender,
              brand: demo.brand ?? null,
              status: ProductStatus.ACTIVE,
              isFeatured: productIndex < 2,
              publishedAt: new Date().toISOString(),
            },
            { client: trx }
          )

          for (const [index, url] of demo.photos.entries()) {
            await ProductMedia.create(
              {
                productId: product.id,
                type: 'image',
                provider: 'external',
                url,
                altText: demo.name,
                sortOrder: index,
              },
              { client: trx }
            )
          }

          const sizes = demo.sizes ?? [null]
          const colors = demo.colors ?? [null]
          for (const sizeValue of sizes) {
            for (const colorValue of colors) {
              const variant = await ProductVariant.create(
                {
                  productId: product.id,
                  sku: `DEMO-${String(skuCounter++).padStart(4, '0')}`,
                  priceMinor: paisaOf(demo.price),
                  comparePriceMinor: demo.comparePrice ? paisaOf(demo.comparePrice) : null,
                  // A few sold-out variants to exercise the UI.
                  quantity: skuCounter % 7 === 0 ? 0 : 5 + (skuCounter % 20),
                  status: VariantStatus.ACTIVE,
                },
                { client: trx }
              )

              const ids: string[] = []
              if (sizeValue) ids.push(await valueFor(size, sizeValue))
              if (colorValue) ids.push(await valueFor(color, colorValue))
              if (ids.length) await variant.related('attributeValues').attach(ids, trx)
            }
          }
        }
      }
    })

    if (!app.inTest) {
      console.log('Demo catalog seeded. Vendor login: demo@dripnepal.com / dripnepal')
    }
  }

  #ensureVendor(trx?: TransactionClientContract) {
    return User.firstOrCreate(
      { email: 'demo@dripnepal.com' },
      {
        fullName: 'Demo Vendor',
        password: 'dripnepal',
        phone: '9800000001',
      },
      { client: trx }
    )
  }

  async #ensurePendingShop() {
    const owner = await this.#ensureVendor()
    await Shop.firstOrCreate(
      { slug: 'bhaktapur-crafts' },
      {
        ownerId: owner.id,
        name: 'Bhaktapur Crafts',
        description: 'Hand-printed scarves and lokta paper goods from Bhaktapur.',
        email: 'hello@bhaktapur-crafts.example',
        phone: '9800000113',
        status: ShopStatus.PENDING,
      }
    )
  }

  async #ensureAdmin() {
    const admin =
      (await User.findBy('email', 'admin@dripnepal.com')) ??
      (await User.create({
        fullName: 'Drip Nepal Admin',
        email: 'admin@dripnepal.com',
        password: 'dripnepal',
      }))
    const role = await GlobalRole.firstOrCreate({ slug: GlobalRoles.ADMIN.slug }, GlobalRoles.ADMIN)
    await admin.related('roles').sync([role.id], false)
  }
}
