import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import drive from '@adonisjs/drive/services/main'
import { errors as vineErrors } from '@vinejs/vine'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import Category from '#models/category'
import ProductMedia from '#models/product_media'
import type Shop from '#models/shop'
import ProductService from '#modules/products/services/product_service'
import { storeProductPhoto } from '#modules/products/services/photo_storage'
import type { ProductPayload } from '#modules/shops/validators/product'
import { ProductGender, ProductStatus } from '#constants/product'
import { createShop } from '#tests/support/fixtures'

/*
 * T-MED-001 for the v1 store, through ProductService: uploads are stored as
 * two WebP files (1600 px in `url`, 640 px in `thumbnail_url`), the original
 * is never stored, a bad file refuses the whole save and leaves nothing
 * behind, and removing a photo deletes both files. Storage is Drive's fake
 * disk, so nothing is written to ./storage.
 */

async function upload(data: Buffer, clientName: string) {
  const tmpPath = join(tmpdir(), randomUUID())
  await writeFile(tmpPath, data)
  // ProductService reads only these fields of an upload.
  return { tmpPath, clientName, extname: clientName.split('.').pop() } as unknown as MultipartFile
}

function phonePhoto() {
  return sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#3a6' } })
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function payload(images: MultipartFile[], keepMediaIds?: string[]): Promise<ProductPayload> {
  const category = await Category.query().orderBy('slug').firstOrFail()
  return {
    name: 'Linen Shirt',
    categoryId: category.id,
    gender: ProductGender.UNISEX,
    status: ProductStatus.ACTIVE,
    variants: [{ priceMinor: 150_000, quantity: 5 }],
    images,
    keepMediaIds,
  } as ProductPayload
}

async function storedKeys(shop: Shop) {
  const { objects } = await drive.use().listAll(`shops/${shop.id}/products`, { recursive: true })
  return [...objects].flatMap((object) => (object.isFile ? [object.key] : [])).sort()
}

async function widthOf(key: string) {
  const info = await sharp(Buffer.from(await drive.use().getBytes(key))).metadata()
  return { format: info.format, width: info.width }
}

let disk: ReturnType<typeof drive.fake>

test.group('T-MED-001 product photos are stored resized [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']).timeout(30_000))
  group.each.setup(() => {
    disk = drive.fake('fs')
    return () => drive.restore('fs')
  })

  test('each upload is stored as a 1600 px and a 640 px WebP, and the original is not kept', async ({
    assert,
  }) => {
    const shop = await createShop()
    const images = [
      await upload(await phonePhoto(), 'front.jpg'),
      await upload(await phonePhoto(), 'back.jpeg'),
    ]

    const product = await new ProductService().create(shop, await payload(images))

    const media = await ProductMedia.query().where('product_id', product.id).orderBy('sort_order')
    assert.lengthOf(media, 2)
    for (const item of media) {
      assert.match(item.url, /-1600\.webp$/)
      assert.match(item.thumbnailUrl ?? '', /-640\.webp$/)
      assert.deepEqual(await widthOf(item.metadata.key), { format: 'webp', width: 1600 })
      assert.deepEqual(await widthOf(item.metadata.thumbnailKey), { format: 'webp', width: 640 })
    }
    // Two files per photo and nothing else: no original.
    assert.deepEqual(
      await storedKeys(shop),
      media.flatMap((item) => [item.metadata.key, item.metadata.thumbnailKey]).sort()
    )
  })

  test('a file that is not a photo refuses the save and leaves no files behind', async ({
    assert,
  }) => {
    const shop = await createShop()
    const images = [
      await upload(await phonePhoto(), 'good.jpg'),
      await upload(Buffer.from('<html>not a photo</html>'), 'bad.jpg'),
    ]

    const error = await new ProductService().create(shop, await payload(images)).then(
      () => null,
      (caught) => caught
    )

    assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
    assert.deepInclude(error.messages[0], {
      field: 'images.1',
      message: "This photo isn't a JPEG, PNG or WebP image.",
    })
    assert.lengthOf(
      await ProductMedia.query().whereHas('product', (p) => p.where('shop_id', shop.id)),
      0
    )
    assert.deepEqual(await storedKeys(shop), [])
  })

  test('if a photo URL cannot be built, no file is left behind', async ({ assert }) => {
    // Outside the web server the URL builder can fail (a command whose
    // router isn't committed); the files must not outlive the failure.
    disk.getUrl = async () => {
      throw new Error('Cannot lookup route "drive.fs.serve"')
    }
    const shop = await createShop()
    const input = await phonePhoto()

    await assert.rejects(
      () => storeProductPhoto(`shops/${shop.id}/products`, input),
      'Cannot lookup route "drive.fs.serve"'
    )
    assert.deepEqual(await storedKeys(shop), [])
  })

  test('removing a photo deletes both of its files', async ({ assert }) => {
    const shop = await createShop()
    const service = new ProductService()
    const product = await service.create(
      shop,
      await payload([
        await upload(await phonePhoto(), 'a.jpg'),
        await upload(await phonePhoto(), 'b.jpg'),
      ])
    )
    const [keep, remove] = await ProductMedia.query()
      .where('product_id', product.id)
      .orderBy('sort_order')

    await service.update(shop, product, await payload([], [keep.id]))

    disk.assertMissing([remove.metadata.key, remove.metadata.thumbnailKey])
    assert.deepEqual(await storedKeys(shop), [keep.metadata.key, keep.metadata.thumbnailKey].sort())
  })
})
