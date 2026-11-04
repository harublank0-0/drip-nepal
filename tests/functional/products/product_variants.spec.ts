import { test } from '@japa/runner'
import { errors as vineErrors } from '@vinejs/vine'
import AttributeValue from '#models/attribute_value'
import Category from '#models/category'
import type Product from '#models/product'
import ProductVariant from '#models/product_variant'
import type Shop from '#models/shop'
import ProductService from '#modules/products/services/product_service'
import type { ProductPayload } from '#modules/shops/validators/product'
import { ProductGender, ProductStatus, VariantStatus } from '#constants/product'
import { createShop } from '#tests/support/fixtures'

/*
 * Variants in the product form of the v1 store: sizes and colors in any
 * script, and SKUs, which are unique across the store in v1. A variant the
 * seller removes is archived and keeps its SKU (order history points at
 * it), so a SKU clash must be told on the field, never end in a 500.
 */

type Row = {
  id?: string
  size?: string
  color?: string
  sku?: string
  quantity?: number
  expectedQuantity?: number
}

async function payload(rows: Row[], name = 'Cotton kurta') {
  const category = await Category.query().orderBy('slug', 'asc').firstOrFail()
  return {
    name,
    categoryId: category.id,
    gender: ProductGender.UNISEX,
    status: ProductStatus.ACTIVE,
    variants: rows.map((row) => ({ price: 1000, quantity: 5, ...row })),
    keepMediaIds: [],
  } as ProductPayload
}

function save(shop: Shop, product: Product, rows: Row[]) {
  return payload(rows).then((body) => new ProductService().update(shop, product, body))
}

// An existing variant as the form sends it back unchanged.
function kept(variant: ProductVariant): Row {
  const option = (slug: string) =>
    variant.attributeValues.find((value) => value.attribute.slug === slug)?.value
  return {
    id: variant.id,
    sku: variant.sku,
    size: option('size'),
    color: option('color'),
    quantity: variant.quantity,
    expectedQuantity: variant.quantity,
  }
}

async function variantsOf(product: Product) {
  return ProductVariant.query()
    .where('product_id', product.id)
    .preload('attributeValues', (values) => values.preload('attribute'))
}

async function variantSized(product: Product, size: string) {
  const variants = await variantsOf(product)
  return variants.find((variant) => variant.attributeValues.some(({ value }) => value === size))!
}

function refusal(promise: Promise<unknown>) {
  return promise.then(
    () => null,
    (error) => error
  )
}

function assertFieldError(
  assert: { instanceOf: Function; match: Function; include: Function },
  error: unknown,
  field: RegExp,
  says: string
) {
  assert.instanceOf(error, vineErrors.E_VALIDATION_ERROR)
  const [first] = (error as { messages: { field: string; message: string }[] }).messages
  assert.match(first?.field, field)
  assert.include(first?.message, says)
}

test.group('Product form variants [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']))

  test('a color in Devanagari can be saved again, and used by another product', async ({
    assert,
  }) => {
    const shop = await createShop()
    const service = new ProductService()
    const first = await service.create(shop, await payload([{ size: 'M', color: 'रातो' }]))
    const [variant] = await variantsOf(first)

    await save(shop, first, [{ ...kept(variant), size: 'M', color: 'रातो' }])
    const second = await service.create(
      shop,
      await payload([{ size: 'L', color: 'रातो' }], 'Silk saree')
    )

    const values = await AttributeValue.query().where('value', 'रातो')
    assert.lengthOf(values, 1)
    const [secondVariant] = await variantsOf(second)
    for (const saved of [...(await variantsOf(first)), secondVariant]) {
      assert.include(
        saved.attributeValues.map((value) => value.id),
        values[0].id
      )
    }
  })

  test('a removed variant comes back when added again with its SKU, size and color', async ({
    assert,
  }) => {
    const shop = await createShop()
    const sku = `TEE-M-RED-${Date.now()}`
    const product = await new ProductService().create(
      shop,
      await payload([
        { size: 'M', color: 'Red', sku, quantity: 4 },
        { size: 'L', color: 'Red', quantity: 2 },
      ])
    )
    const medium = await variantSized(product, 'M')
    const large = await variantSized(product, 'L')
    await save(shop, product, [kept(large)])

    await save(shop, product, [kept(large), { size: 'M', color: 'red', sku, quantity: 7 }])

    const back = await ProductVariant.findOrFail(medium.id)
    assert.equal(back.status, VariantStatus.ACTIVE)
    assert.equal(back.sku, sku)
    assert.equal(back.quantity, 7)
    const active = await ProductVariant.query()
      .where('product_id', product.id)
      .where('status', VariantStatus.ACTIVE)
    assert.lengthOf(active, 2)
    assert.deepEqual(kept(await variantSized(product, 'L')).color, 'Red')
  })

  test("a removed variant's SKU on another size is refused on the field", async ({ assert }) => {
    const shop = await createShop()
    const sku = `TEE-M-RED-${Date.now()}`
    const product = await new ProductService().create(
      shop,
      await payload([
        { size: 'M', color: 'Red', sku },
        { size: 'L', color: 'Red' },
      ])
    )
    const large = await variantSized(product, 'L')
    await save(shop, product, [kept(large)])

    const error = await refusal(
      save(shop, product, [kept(large), { size: 'S', color: 'Red', sku }])
    )

    assertFieldError(assert, error, /^variants\.1\.sku$/, 'A variant you removed')
  })

  test('removing a variant and adding its SKU in the same save is refused on the field', async ({
    assert,
  }) => {
    const shop = await createShop()
    const sku = `TEE-M-RED-${Date.now()}`
    const product = await new ProductService().create(
      shop,
      await payload([
        { size: 'M', color: 'Red', sku },
        { size: 'L', color: 'Red' },
      ])
    )
    const large = await variantSized(product, 'L')

    const error = await refusal(
      save(shop, product, [kept(large), { size: 'M', color: 'Red', sku }])
    )

    assertFieldError(assert, error, /^variants\.1\.sku$/, 'Save the removal first')
  })

  test('two variants swapping SKUs in one save are refused, saying how to do it', async ({
    assert,
  }) => {
    const shop = await createShop()
    const product = await new ProductService().create(
      shop,
      await payload([
        { size: 'M', sku: `SWAP-A-${Date.now()}` },
        { size: 'L', sku: `SWAP-B-${Date.now()}` },
      ])
    )
    const medium = await variantSized(product, 'M')
    const large = await variantSized(product, 'L')

    const error = await refusal(
      save(shop, product, [
        { ...kept(medium), sku: large.sku },
        { ...kept(large), sku: medium.sku },
      ])
    )

    assertFieldError(assert, error, /^variants\.[01]\.sku$/, 'give one a temporary SKU')
  })

  test('giving up a SKU and reusing it in one save is refused, saying how', async ({ assert }) => {
    const shop = await createShop()
    const sku = `MOVE-A-${Date.now()}`
    const product = await new ProductService().create(shop, await payload([{ size: 'M', sku }]))
    const medium = await variantSized(product, 'M')

    const error = await refusal(
      save(shop, product, [
        { ...kept(medium), sku: `MOVE-B-${Date.now()}` },
        { size: 'L', sku },
      ])
    )

    assertFieldError(assert, error, /^variants\.1\.sku$/, 'Save that change first')
  })

  test("the shop's other product's SKU is refused, naming the product", async ({ assert }) => {
    const shop = await createShop()
    const sku = `KURTA-M-${Date.now()}`
    await new ProductService().create(shop, await payload([{ size: 'M', sku }], 'Silk saree'))

    const error = await refusal(
      new ProductService().create(shop, await payload([{ size: 'L', sku }], 'Other'))
    )

    assertFieldError(assert, error, /^variants\.0\.sku$/, 'Your product "Silk saree"')
  })

  test('a SKU of a product the shop deleted is refused, saying so', async ({ assert }) => {
    const shop = await createShop()
    const sku = `KURTA-M-${Date.now()}`
    const service = new ProductService()
    const deleted = await service.create(shop, await payload([{ size: 'M', sku }], 'Old kurta'))
    await service.archive(deleted)

    const error = await refusal(service.create(shop, await payload([{ size: 'M', sku }], 'New')))

    assertFieldError(assert, error, /^variants\.0\.sku$/, 'A product you deleted ("Old kurta")')
  })

  test("another shop's SKU is refused without naming its product", async ({ assert }) => {
    const sku = `KURTA-M-${Date.now()}`
    await new ProductService().create(
      await createShop(),
      await payload([{ size: 'M', sku }], 'Their kurta')
    )

    const error = await refusal(
      new ProductService().create(await createShop(), await payload([{ size: 'M', sku }], 'Mine'))
    )

    assertFieldError(assert, error, /^variants\.0\.sku$/, 'already in use')
    assert.notInclude((error as Error).message + JSON.stringify(error), 'Their kurta')
  })
})
