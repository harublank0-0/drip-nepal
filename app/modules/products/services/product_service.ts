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

// What the variant holding a clashing SKU does with it in this save.
type SkuMove = 'removed' | 'kept' | 'cycle' | 'given-up'

// A variant that holds a SKU, with its product, for the clash message.
type SkuHolder = {
  id: string
  sku: string
  status: string
  product_id: string
  shop_id: string
  name: string
  deleted_at: Date | null
}

/*
 * Every file a media row owns. Rows from before photos were resized have
 * only `key`, the original upload.
 */
function mediaFileKeys(media: ProductMedia): string[] {
  return [media.metadata?.key, media.metadata?.thumbnailKey].filter(Boolean)
}

/*
 * A variant's size and color as one key. Values are matched without case,
 * as their slugs are ("Red" and "red" are one color).
 */
function optionKey(size: string | undefined, color: string | undefined) {
  return `${size?.toLowerCase() ?? ''}|${color?.toLowerCase() ?? ''}`
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

      // Locked in ascending id first, the order checkout locks variants in
      // (docs/05 §4.4), so deleting a product never deadlocks with a
      // checkout of two of its variants.
      await ProductVariant.query({ client: trx })
        .where('product_id', product.id)
        .orderBy('id', 'asc')
        .forUpdate()
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
    // Locked in ascending id, the order checkout locks variants in
    // (docs/05 §4.4), so a save and a checkout never deadlock, and the
    // stock compared below is current.
    const existing = await ProductVariant.query({ client: trx })
      .where('product_id', product.id)
      .orderBy('id', 'asc')
      .forUpdate()
    const existingById = new Map(existing.map((variant) => [variant.id, variant]))
    const restored = await this.#removedVariantsAddedBack(inputs, existing, trx)

    await this.#assertVariantsAreValid(product, inputs, existingById, restored, trx)

    const keptIds = new Set<string>()

    for (const [index, input] of inputs.entries()) {
      const stored = input.id ? existingById.get(input.id) : undefined
      // The form lists active variants only, so this one was removed
      // elsewhere (another tab) after the page loaded.
      if (stored?.status === VariantStatus.ARCHIVED) {
        fieldError(
          `variants.${index}.id`,
          'This variant was removed while you were editing. Reload the page to see the current variants.'
        )
      }
      const variant = stored ?? restored.get(index) ?? new ProductVariant()
      variant.useTransaction(trx)
      variant.merge({
        productId: product.id,
        sku: input.sku ?? variant.sku ?? this.#makeSku(shop),
        price: input.price.toFixed(2),
        comparePrice: typeof input.comparePrice === 'number' ? input.comparePrice.toFixed(2) : null,
        status: VariantStatus.ACTIVE,
      })
      variant.quantity = stored ? this.#stockToSave(stored, input, index) : input.quantity
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

  /*
   * The stock to keep for an existing variant, read under its row lock.
   * The form can be open for minutes while customers buy, so it sends the
   * stock it showed (`expectedQuantity`). A number the seller didn't change
   * keeps the current stock, so sales made meanwhile stand. A changed
   * number is taken only if the stock is still what the form showed;
   * otherwise the seller is told the current stock and saves again. This
   * is the stocktake rule of docs/05 §5.9 (`expected_on_hand`).
   */
  #stockToSave(locked: ProductVariant, input: VariantInput, index: number) {
    const field = `variants.${index}.expectedQuantity`
    if (input.expectedQuantity === undefined) {
      fieldError(field, 'Reload the page to see the current stock, then save again')
    }
    if (input.quantity === input.expectedQuantity) return locked.quantity
    if (locked.quantity !== input.expectedQuantity) {
      fieldError(
        field,
        `Stock changed to ${locked.quantity} while you were editing (an order or a cancellation). Check the number and save again.`
      )
    }
    return input.quantity
  }

  /*
   * Rows without an id that bring back a removed (archived) variant of
   * this product: same SKU, size and color. In v1 a SKU is unique across
   * the store and a removed variant keeps it, so adding the variant again
   * reuses its row. Its stock is the number entered, as for a new row.
   * (In the target schema an archived SKU is free to reuse, docs/04a §7.8.)
   */
  async #removedVariantsAddedBack(
    inputs: VariantInput[],
    existing: ProductVariant[],
    trx: TransactionClientContract
  ) {
    const restored = new Map<number, ProductVariant>()
    for (const [index, input] of inputs.entries()) {
      if (input.id || !input.sku) continue
      const removed = existing.find(
        (variant) => variant.status === VariantStatus.ARCHIVED && variant.sku === input.sku
      )
      if (!removed) continue
      const values = await removed
        .related('attributeValues')
        .query()
        .useTransaction(trx)
        .preload('attribute')
      const option = (slug: string) =>
        values.find((value) => value.attribute.slug === slug)?.value ?? ''
      if (
        optionKey(option(VariantAttributes.SIZE.slug), option(VariantAttributes.COLOR.slug)) ===
        optionKey(input.size, input.color)
      ) {
        restored.set(index, removed)
      }
    }
    return restored
  }

  async #assertVariantsAreValid(
    product: Product,
    inputs: VariantInput[],
    existingById: Map<string, ProductVariant>,
    restored: Map<number, ProductVariant>,
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

      const options = optionKey(input.size, input.color)
      if (seenOptions.has(options)) {
        fieldError(`variants.${index}.size`, 'Two variants have the same size and color')
      }
      seenOptions.set(options, index)

      if (input.sku) {
        if (seenSkus.has(input.sku)) {
          fieldError(`variants.${index}.sku`, 'Two variants have the same SKU')
        }
        seenSkus.set(input.sku, index)
      }
    }

    if (seenSkus.size === 0) return

    // Any variant holding the SKU other than the row's own (or the removed
    // variant it brings back) is a clash: the insert or update would break
    // the store-wide unique SKU. The message says where the SKU is.
    const holders: SkuHolder[] = await trx
      .from('product_variants')
      .join('products', 'products.id', 'product_variants.product_id')
      .whereIn('product_variants.sku', [...seenSkus.keys()])
      .select(
        'product_variants.id',
        'product_variants.sku',
        'product_variants.status',
        'products.id as product_id',
        'products.shop_id',
        'products.name',
        'products.deleted_at'
      )
    for (const holder of holders) {
      const index = seenSkus.get(holder.sku)!
      if (holder.id === inputs[index].id || holder.id === restored.get(index)?.id) continue
      fieldError(
        `variants.${index}.sku`,
        this.#skuClash(holder, product, this.#skuMove(holder, index, inputs, existingById))
      )
    }
  }

  /*
   * For a SKU held by another active variant of this product that stays in
   * this save: whether that variant keeps the SKU, or gives it up as part
   * of a cycle (two or more variants passing SKUs round, which no single
   * change can be saved first), or simply gives it up.
   */
  #skuMove(
    holder: SkuHolder,
    index: number,
    inputs: VariantInput[],
    existingById: Map<string, ProductVariant>
  ): SkuMove {
    const rowById = new Map(inputs.filter((input) => input.id).map((input) => [input.id, input]))
    const holderRow = rowById.get(holder.id)
    if (!holderRow) return 'removed'
    // An empty SKU box keeps the stored SKU.
    if ((holderRow.sku ?? holder.sku) === holder.sku) return 'kept'

    const active = [...existingById.values()].filter(
      (variant) => variant.status === VariantStatus.ACTIVE
    )
    const holderOf = new Map(active.map((variant) => [variant.sku, variant]))
    const start = existingById.get(inputs[index].id ?? '')?.sku
    let sku: string | undefined = inputs[index].sku
    for (let step = 0; start && sku && step < inputs.length; step++) {
      const next = holderOf.get(sku)
      const row = next && rowById.get(next.id)
      if (!next || !row) break
      sku = row.sku ?? next.sku
      if (sku === start) return 'cycle'
      if (sku === next.sku) break
    }
    return 'given-up'
  }

  #skuClash(holder: SkuHolder, product: Product, move: SkuMove) {
    if (holder.product_id === product.id) {
      if (holder.status === VariantStatus.ARCHIVED) {
        return 'A variant you removed from this product still has this SKU. Use another SKU.'
      }
      switch (move) {
        case 'kept':
          return 'Another variant of this product has this SKU. Change its SKU first, or use another SKU here.'
        case 'cycle':
          return "SKUs can't move round between variants in one save: give one a temporary SKU and save, then set the final SKUs."
        case 'given-up':
          return 'Another variant of this product has this SKU until this save. Save that change first, then use the SKU here.'
        case 'removed':
          return 'A variant you are removing has this SKU. Save the removal first, then add the variant again.'
      }
    }
    if (holder.shop_id !== product.shopId) return 'This SKU is already in use. Use another SKU.'
    if (holder.deleted_at) {
      return `A product you deleted ("${holder.name}") used this SKU. Use another SKU.`
    }
    return `Your product "${holder.name}" already uses this SKU`
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
    // The value as written, however it was slugged: a value with no Latin
    // letters (रातो) slugs to '' and gets a random slug, so the slug can't
    // find it again.
    const known = await AttributeValue.query({ client: trx })
      .where('attribute_id', attribute.id)
      .whereRaw('lower(value) = lower(?)', [value])
      .first()
    if (known) return known.id

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
