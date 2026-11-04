import { readFile } from 'node:fs/promises'
import { DateTime } from 'luxon'
import string from '@adonisjs/core/helpers/string'
import db from '@adonisjs/lucid/services/db'
import { errors as vineErrors } from '@vinejs/vine'
import type { MultipartFile } from '@adonisjs/core/bodyparser'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'

import { randomCode } from '#utils/random'
import Attribute from '#models/attribute'
import AttributeValue from '#models/attribute_value'
import Product from '#models/product'
import ProductMedia from '#models/product_media'
import ProductVariant from '#models/product_variant'
import type Shop from '#models/shop'
import {
  MAX_PRODUCT_IMAGES,
  ProductStatus,
  VariantAttributes,
  VariantStatus,
} from '#constants/product'
import type { ProductPayload } from '#modules/shops/validators/product'
import { PhotoRejected } from '#modules/products/photos'
import {
  deletePhotoFiles,
  storeProductPhoto,
  type StoredPhotoFiles,
} from '#modules/products/services/photo_storage'

type VariantInput = ProductPayload['variants'][number]

type StoredPhoto = StoredPhotoFiles & { name: string }

/*
 * Every file a media row owns. Rows from before photos were resized have
 * only `key`, the original upload.
 */
function mediaFileKeys(media: ProductMedia): string[] {
  return [media.metadata?.key, media.metadata?.thumbnailKey].filter(Boolean)
}

/*
 * Throws the same error VineJS throws, so Inertia shows the message under
 * the right form field.
 */
function fieldError(field: string, message: string): never {
  throw new vineErrors.E_VALIDATION_ERROR([{ field, message, rule: 'database' }])
}

export default class ProductService {
  /*
   * Products as the shop sees them: everything except deleted ones.
   */
  shopProductsQuery(shop: Shop) {
    return Product.query()
      .where('shop_id', shop.id)
      .whereNull('deleted_at')
      .preload('category')
      .preload('media', (media) => media.orderBy('sort_order', 'asc'))
      .preload('variants', (variants) =>
        variants
          .where('status', VariantStatus.ACTIVE)
          .orderBy('created_at', 'asc')
          .preload('attributeValues', (values) => values.preload('attribute'))
      )
  }

  async findForShop(shop: Shop, productId: string) {
    return this.shopProductsQuery(shop).where('id', productId).firstOrFail()
  }

  async create(shop: Shop, payload: ProductPayload) {
    const uploaded = await this.#uploadImages(shop, payload.images ?? [])

    try {
      return await db.transaction(async (trx) => {
        const product = new Product()
        product.useTransaction(trx)
        product.merge({
          shopId: shop.id,
          slug: this.#makeSlug(payload.name),
          isFeatured: false,
        })
        this.#applyFields(product, payload)
        await product.save()

        await this.#syncVariants(shop, product, payload.variants, trx)
        await this.#syncMedia(product, [], uploaded, trx)

        return product
      })
    } catch (error) {
      await this.#deleteFiles(uploaded.flatMap((photo) => [photo.key, photo.thumbnailKey]))
      throw error
    }
  }

  async update(shop: Shop, product: Product, payload: ProductPayload) {
    const keepMediaIds = payload.keepMediaIds ?? []
    const existingMedia = await ProductMedia.query().where('product_id', product.id)

    for (const [index, id] of keepMediaIds.entries()) {
      if (!existingMedia.some((media) => media.id === id)) {
        fieldError(`keepMediaIds.${index}`, 'This image does not belong to the product')
      }
    }

    const newImages = payload.images ?? []
    if (keepMediaIds.length + newImages.length > MAX_PRODUCT_IMAGES) {
      fieldError('images', `A product can have at most ${MAX_PRODUCT_IMAGES} images`)
    }

    const uploaded = await this.#uploadImages(shop, newImages)
    const removedMedia = existingMedia.filter((media) => !keepMediaIds.includes(media.id))

    try {
      await db.transaction(async (trx) => {
        product.useTransaction(trx)
        this.#applyFields(product, payload)
        await product.save()

        await this.#syncVariants(shop, product, payload.variants, trx)
        await this.#syncMedia(product, keepMediaIds, uploaded, trx)

        if (removedMedia.length > 0) {
          await ProductMedia.query({ client: trx })
            .whereIn(
              'id',
              removedMedia.map((media) => media.id)
            )
            .delete()
        }
      })
    } catch (error) {
      await this.#deleteFiles(uploaded.flatMap((photo) => [photo.key, photo.thumbnailKey]))
      throw error
    }

    await this.#deleteFiles(removedMedia.flatMap(mediaFileKeys))
    return product
  }

  /*
   * Soft delete: past orders keep pointing at the product and its variants.
   */
  async archive(product: Product) {
    await db.transaction(async (trx) => {
      product.useTransaction(trx)
      product.status = ProductStatus.ARCHIVED
      product.deletedAt = DateTime.now()
      await product.save()

      await ProductVariant.query({ client: trx })
        .where('product_id', product.id)
        .update({ status: VariantStatus.ARCHIVED })
    })
  }

  #applyFields(product: Product, payload: ProductPayload) {
    product.merge({
      name: payload.name,
      description: payload.description ?? null,
      categoryId: payload.categoryId,
      gender: payload.gender,
      brand: payload.brand ?? null,
      status: payload.status,
    })

    if (payload.status === ProductStatus.ACTIVE && !product.publishedAt) {
      product.publishedAt = DateTime.now().toISO()
    }
  }

  #makeSlug(name: string) {
    const base = string.slug(name, { lower: true, strict: true }).slice(0, 90) || 'product'
    return `${base}-${randomCode(6)}`
  }

  #makeSku(shop: Shop) {
    const prefix =
      shop.slug
        .replace(/[^a-z0-9]/gi, '')
        .slice(0, 6)
        .toUpperCase() || 'DRIP'
    return `${prefix}-${randomCode(8).toUpperCase()}`
  }

  async #syncVariants(
    shop: Shop,
    product: Product,
    inputs: VariantInput[],
    trx: TransactionClientContract
  ) {
    const existing = await ProductVariant.query({ client: trx }).where('product_id', product.id)
    const existingById = new Map(existing.map((variant) => [variant.id, variant]))

    await this.#assertVariantsAreValid(product, inputs, existingById, trx)

    const keptIds = new Set<string>()

    for (const input of inputs) {
      const variant = (input.id && existingById.get(input.id)) || new ProductVariant()
      variant.useTransaction(trx)
      variant.merge({
        productId: product.id,
        sku: input.sku ?? variant.sku ?? this.#makeSku(shop),
        price: input.price.toFixed(2),
        comparePrice: typeof input.comparePrice === 'number' ? input.comparePrice.toFixed(2) : null,
        quantity: input.quantity,
        status: VariantStatus.ACTIVE,
      })
      await variant.save()
      keptIds.add(variant.id)

      const valueIds: string[] = []
      if (input.size) {
        valueIds.push(await this.#findOrCreateValue(VariantAttributes.SIZE, input.size, trx))
      }
      if (input.color) {
        valueIds.push(await this.#findOrCreateValue(VariantAttributes.COLOR, input.color, trx))
      }
      await variant.related('attributeValues').sync(valueIds, true, trx)
    }

    for (const variant of existing) {
      if (!keptIds.has(variant.id) && variant.status !== VariantStatus.ARCHIVED) {
        variant.useTransaction(trx)
        variant.status = VariantStatus.ARCHIVED
        await variant.save()
      }
    }
  }

  async #assertVariantsAreValid(
    product: Product,
    inputs: VariantInput[],
    existingById: Map<string, ProductVariant>,
    trx: TransactionClientContract
  ) {
    const seenOptions = new Map<string, number>()
    const seenSkus = new Map<string, number>()

    for (const [index, input] of inputs.entries()) {
      if (input.id && !existingById.has(input.id)) {
        fieldError(`variants.${index}.id`, 'This variant does not belong to the product')
      }

      if (typeof input.comparePrice === 'number' && input.comparePrice <= input.price) {
        fieldError(
          `variants.${index}.comparePrice`,
          'The compare-at price must be higher than the price'
        )
      }

      const optionKey = `${input.size?.toLowerCase() ?? ''}|${input.color?.toLowerCase() ?? ''}`
      if (seenOptions.has(optionKey)) {
        fieldError(`variants.${index}.size`, 'Two variants have the same size and color')
      }
      seenOptions.set(optionKey, index)

      if (input.sku) {
        if (seenSkus.has(input.sku)) {
          fieldError(`variants.${index}.sku`, 'Two variants have the same SKU')
        }
        seenSkus.set(input.sku, index)
      }
    }

    if (seenSkus.size === 0) return

    const conflicts = await ProductVariant.query({ client: trx })
      .whereIn('sku', [...seenSkus.keys()])
      .whereNot('product_id', product.id ?? '00000000-0000-0000-0000-000000000000')
      .select('sku')

    if (conflicts.length > 0) {
      const index = seenSkus.get(conflicts[0].sku)!
      fieldError(`variants.${index}.sku`, 'This SKU is already used by another product')
    }
  }

  async #findOrCreateValue(
    definition: { name: string; slug: string; filterable: boolean },
    rawValue: string,
    trx: TransactionClientContract
  ) {
    const attribute = await Attribute.firstOrCreate(
      { slug: definition.slug },
      { name: definition.name, filterable: definition.filterable },
      { client: trx }
    )

    const value = rawValue.trim()
    const slug = string.slug(value, { lower: true, strict: true }) || randomCode(6)

    const attributeValue = await AttributeValue.firstOrCreate(
      { attributeId: attribute.id, slug },
      { value },
      { client: trx }
    )

    return attributeValue.id
  }

  async #syncMedia(
    product: Product,
    keepMediaIds: string[],
    uploaded: StoredPhoto[],
    trx: TransactionClientContract
  ) {
    for (const [index, id] of keepMediaIds.entries()) {
      await ProductMedia.query({ client: trx }).where('id', id).update({ sort_order: index })
    }

    for (const [offset, image] of uploaded.entries()) {
      await ProductMedia.create(
        {
          productId: product.id,
          type: 'image',
          provider: 'drive',
          url: image.url,
          thumbnailUrl: image.thumbnailUrl,
          altText: product.name.slice(0, 100),
          metadata: {
            key: image.key,
            thumbnailKey: image.thumbnailKey,
            originalName: image.name,
            width: image.width,
            height: image.height,
          },
          sortOrder: keepMediaIds.length + offset,
        },
        { client: trx }
      )
    }
  }

  /*
   * Resizes and stores every photo before the database is touched. A photo
   * that can't be used refuses the whole save, with the message under that
   * photo, and the files already written are deleted.
   */
  async #uploadImages(shop: Shop, images: MultipartFile[]) {
    const uploaded: StoredPhoto[] = []

    try {
      for (const [index, image] of images.entries()) {
        const input = await readFile(image.tmpPath!)
        const files = await storeProductPhoto(`shops/${shop.id}/products`, input).catch((error) => {
          if (error instanceof PhotoRejected) fieldError(`images.${index}`, error.message)
          throw error
        })
        uploaded.push({ ...files, name: image.clientName })
      }
    } catch (error) {
      await this.#deleteFiles(uploaded.flatMap((photo) => [photo.key, photo.thumbnailKey]))
      throw error
    }

    return uploaded
  }

  async #deleteFiles(keys: string[]) {
    await deletePhotoFiles(keys)
  }
}
