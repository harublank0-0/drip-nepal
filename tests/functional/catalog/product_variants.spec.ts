import { test } from '@japa/runner'
import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import { ProductFactory } from '#database/factories/product_factory'
import {
  audits,
  create,
  draftBody,
  fields,
  jobsFor,
  productPath,
  world,
  type World,
} from '#tests/support/catalog'
import { send } from '#tests/support/courier_http'
import { useJobBoss } from '#tests/support/jobs'
import { refused } from '#tests/support/schema_rows'

/*
 * `replaceProductVariants` ⟳ over HTTP (docs/06 §13.5, §14.2; 01 FR-CAT-004;
 * docs/04 §3.5; docs/04a §7.8–§7.10; R1-S part 2b):
 * - T-CAT-011 (new): the first edit replaces the default variant with
 *   variants on an axis: the axes and variants as sent, the labels, the
 *   default deleted with its stock row, new stock rows at 0, `version + 1`,
 *   one `product.variants_replace` audit row with the counts and the axes,
 *   one `catalog.refresh_listing` job; a kept variant is updated by `id`
 *   (an upper-case ID too) and its version moves; two kept variants may
 *   swap their SKUs or options; a variant left out without history is
 *   deleted, archived or not; a set that changes nothing keeps the
 *   version; a `rejected` product returns to `draft`; `pending_review`,
 *   `archived` and `blocked` are 409;
 *   the compare-at price must be above the price.
 * - T-CAT-102: a duplicate combination is 422 on
 *   `variants.N.option_value_codes` (`unique`), a duplicate SKU on
 *   `variants.N.sku`, and a SKU of another product of the shop too; another
 *   shop may use the same SKU (AC-FR-CAT-004-2).
 * - T-CAT-103: an axis the category does not offer, a value for an axis the
 *   product does not vary by, and an unknown value are refused; the
 *   database refuses an option value of an attribute that is not an axis
 *   (23503).
 * - T-CAT-106: a stocked product's axes are fixed (409), reordering them is
 *   allowed in place; a stocked variant left out is archived, keeps its
 *   options and is re-activated by its `id`, unless its SKU is now taken;
 *   an order line is history too; a variant without history on a stocked
 *   product is deleted; a stocked variant may change its SKU; an inactive
 *   value stays on its variant; an axis the product has stays usable after
 *   its rule is dropped; a live product keeps its required axes, a price
 *   above zero and at least one variant, and never a default variant
 *   beside axis variants. Since R1-S part 2f-ii the editor view gives each
 *   variant its `option_value_codes` and `has_history`, which the seller's
 *   variant editor reads.
 * - T-CAT-109: a variant row pointing at another shop's product is 23503.
 * - T-API-004 (428, 412 with `current`), T-SEC-001 (another shop's product,
 *   and case (c): another shop's variant `id`, both 404), T-SEC-003
 *   (`is_default`, `status` and unknown members are `unknown_field`).
 */

type Variant = {
  id: string
  sku: string
  label: string
  status: string
  is_default: boolean
  on_hand: number
}

const variantsPath = (w: World, productId: string) =>
  `${productPath(w.shop.slug, productId)}/variants`

function replace(w: World, productId: string, body: unknown, version: number | null) {
  return send(
    w.owner,
    'PUT',
    variantsPath(w, productId),
    body,
    version === null ? {} : { 'If-Match': `"${version}"` }
  )
}

const sized = (size: string, sku: string, extra: Record<string, unknown> = {}) => ({
  option_value_codes: { apparel_size: size },
  sku,
  price_minor: 129900,
  ...extra,
})

async function draft(w: World) {
  const response = await create(w, await draftBody())
  return response.body.data as { id: string; public_id: string; variants: Variant[] }
}

// Gives a variant history: stock received through an adjustment (docs/05 §5.2).
async function stock(shopId: string, variantId: string, quantity = 3, actorUserId?: string) {
  await db
    .from('inventory_items')
    .where({ variant_id: variantId, shop_id: shopId })
    .increment('on_hand', quantity)
  await db.table('inventory_movements').insert({
    shop_id: shopId,
    variant_id: variantId,
    kind: 'adjustment',
    on_hand_delta: quantity,
    reserved_delta: 0,
    reason_code: 'received_stock',
    actor_user_id: actorUserId ?? null,
    reference_type: 'request',
    reference_id: randomUUID(),
  })
}

test.group('T-CAT-011 replaceProductVariants', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  test('T-CAT-011 the first edit replaces the default variant with sized variants', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const defaultId = product.variants[0].id
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [sized('s', 'TEE-S'), sized('m', 'TEE-M', { compare_at_price_minor: 149900 })],
      },
      1
    )
    assert.equal(response.status, 200, response.text)
    assert.equal(response.headers.get('etag'), '"2"')
    const data = response.body.data
    assert.deepEqual(data.option_axes, ['apparel_size'])
    assert.deepEqual(
      data.variants.map((variant: Variant) => [variant.sku, variant.label, variant.is_default]),
      [
        ['TEE-S', 'Size: S', false],
        ['TEE-M', 'Size: M', false],
      ]
    )
    assert.deepEqual(data.variants[1].compare_at_price, { amount_minor: 149900, currency: 'NPR' })
    assert.notInclude(data.missing_for_submit, 'variants')
    assert.lengthOf(await db.from('product_variants').where('id', defaultId), 0)
    assert.lengthOf(await db.from('inventory_items').where('variant_id', defaultId), 0)
    const stockRows = await db
      .from('inventory_items')
      .whereIn(
        'variant_id',
        data.variants.map((variant: Variant) => variant.id)
      )
      .select('on_hand')
    assert.deepEqual(
      stockRows.map((row) => row.on_hand),
      [0, 0]
    )
    const signatures = await db
      .from('product_variants')
      .where('product_id', product.id)
      .orderBy('sku')
      .select('option_signature')
    assert.deepEqual(
      signatures.map((row) => row.option_signature),
      ['apparel_size:m', 'apparel_size:s']
    )
    const [audit] = await audits(product.id, 'product.variants_replace')
    assert.deepEqual(audit.changes, {
      option_axes: { from: [], to: ['apparel_size'] },
      created: 2,
      updated: 0,
      reactivated: 0,
      archived: 0,
      deleted: 1,
    })
    assert.lengthOf(await jobsFor(product.id), 2, 'the create and this replace')
  })

  test('T-CAT-011 a kept variant is updated by id; a set that changes nothing keeps the version', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const first = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S'), sized('m', 'TEE-M')] },
      1
    )
    const [small, medium] = first.body.data.variants as Variant[]
    const body = {
      option_axes: ['apparel_size'],
      variants: [
        { ...sized('s', 'TEE-S'), id: small.id, price_minor: 99900 },
        { ...sized('m', 'TEE-M'), id: medium.id },
      ],
    }
    const repriced = await replace(w, product.id, body, 2)
    assert.equal(repriced.status, 200, repriced.text)
    assert.equal(repriced.body.data.version, 3)
    assert.equal(repriced.body.data.variants[0].id, small.id)
    assert.deepEqual(repriced.body.data.variants[0].price, { amount_minor: 99900, currency: 'NPR' })
    const [, second] = await audits(product.id, 'product.variants_replace')
    assert.deepEqual(second.changes, {
      created: 0,
      updated: 1,
      reactivated: 0,
      archived: 0,
      deleted: 0,
    })
    const same = await replace(w, product.id, body, 3)
    assert.equal(same.status, 200)
    assert.equal(same.body.data.version, 3)
    assert.lengthOf(await audits(product.id, 'product.variants_replace'), 2)
    assert.lengthOf(await jobsFor(product.id), 3, 'no job for a set that changes nothing')
  })

  test('T-CAT-011 two kept variants may swap their SKUs or their options in one request', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const first = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'SKU-A'), sized('m', 'SKU-B')] },
      1
    )
    const [small, medium] = first.body.data.variants as Variant[]
    const skus = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [
          { ...sized('s', 'SKU-B'), id: small.id },
          { ...sized('m', 'SKU-A'), id: medium.id },
        ],
      },
      2
    )
    assert.equal(skus.status, 200, skus.text)
    const options = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [
          { ...sized('m', 'SKU-B'), id: small.id },
          { ...sized('s', 'SKU-A'), id: medium.id },
        ],
      },
      3
    )
    assert.equal(options.status, 200, options.text)
    const rows = await db
      .from('product_variants')
      .whereIn('id', [small.id, medium.id])
      .orderBy('sku')
      .select('id', 'sku', 'option_signature', 'status')
    assert.deepEqual(
      rows.map((row) => [row.id, row.sku, row.option_signature, row.status]),
      [
        [medium.id, 'SKU-A', 'apparel_size:s', 'active'],
        [small.id, 'SKU-B', 'apparel_size:m', 'active'],
      ]
    )
    // The option rows follow the signature, so the labels read them back.
    const labels = new Map(
      (options.body.data.variants as Variant[]).map((variant) => [variant.id, variant.label])
    )
    assert.equal(labels.get(small.id), 'Size: M')
    assert.equal(labels.get(medium.id), 'Size: S')
    const optionRows = await db
      .from('variant_option_values as o')
      .join('attribute_values as v', 'v.id', 'o.attribute_value_id')
      .where('o.variant_id', small.id)
      .select('v.code')
    assert.deepEqual(
      optionRows.map((row) => row.code),
      ['m']
    )
  })

  test('T-CAT-011 an upper-case variant id names the same variant', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const first = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S')] },
      1
    )
    const [small] = first.body.data.variants as Variant[]
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [{ ...sized('s', 'TEE-S', { price_minor: 5000 }), id: small.id.toUpperCase() }],
      },
      2
    )
    assert.equal(response.status, 200, response.text)
    assert.equal(response.body.data.variants[0].id, small.id)
    const row = await db.from('product_variants').where('id', small.id).firstOrFail()
    assert.deepEqual([row.price_minor, row.version], [5000, 2], 'the kept variant’s version moves')
  })

  test('T-CAT-011 a variant left out without history is deleted, archived or not', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const first = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S'), sized('m', 'TEE-M')] },
      1
    )
    const [small, medium] = first.body.data.variants as Variant[]
    await db.from('product_variants').where('id', medium.id).update({ status: 'archived' })
    const response = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [{ ...sized('s', 'TEE-S'), id: small.id }] },
      2
    )
    assert.equal(response.status, 200, response.text)
    assert.lengthOf(await db.from('product_variants').where('id', medium.id), 0)
    assert.lengthOf(await db.from('inventory_items').where('variant_id', medium.id), 0)
  })

  test('T-CAT-011 a rejected product returns to draft; under review, archived or blocked is 409', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    await db
      .from('products')
      .where('id', product.id)
      .update({ status: 'rejected', rejection_reason: 'Wrong sizes' })
    const body = { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S')] }
    const fixed = await replace(w, product.id, body, 1)
    assert.equal(fixed.status, 200, fixed.text)
    assert.equal(fixed.body.data.status, 'draft')
    const [audit] = await audits(product.id, 'product.variants_replace')
    assert.deepEqual(audit.changes.status, { from: 'rejected', to: 'draft' })
    await db
      .from('products')
      .where('id', product.id)
      .update({ warranty_text: 'No warranty', submitted_at: db.raw('now()') })
    for (const status of ['pending_review', 'archived', 'blocked'] as const) {
      await db.from('products').where('id', product.id).update({ status })
      const refusedReplace = await replace(w, product.id, body, 2)
      assert.equal(refusedReplace.status, 409, status)
      assert.equal(refusedReplace.body.code, 'INVALID_STATE_TRANSITION')
    }
  })

  test('T-CAT-011 the compare-at price must be above the price', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [sized('s', 'TEE-S', { compare_at_price_minor: 129900 })],
      },
      1
    )
    assert.equal(response.status, 422)
    assert.deepEqual(fields(response.body), [['variants.0.compare_at_price_minor', 'invalid']])
  })

  test('T-CAT-102 a duplicate combination or SKU is 422 on its entry', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const twice = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [sized('s', 'TEE-S'), sized('s', 'TEE-S2'), sized('m', 'TEE-S')],
      },
      1
    )
    assert.equal(twice.status, 422)
    assert.deepEqual(fields(twice.body), [
      ['variants.1.option_value_codes', 'unique'],
      ['variants.2.sku', 'unique'],
    ])
    const other = await draft(w)
    await replace(
      w,
      other.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'SHARED-SKU')] },
      1
    )
    const taken = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'SHARED-SKU')] },
      1
    )
    assert.deepEqual(fields(taken.body), [['variants.0.sku', 'unique']])
    const elsewhere = await world()
    const foreign = await draft(elsewhere)
    const allowed = await replace(
      elsewhere,
      foreign.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'SHARED-SKU')] },
      1
    )
    assert.equal(allowed.status, 200, 'another shop may use the same SKU')
  })

  test('T-CAT-103 the axes and values must be the category’s and the product’s', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['shoe_size_eu'],
        variants: [{ option_value_codes: { shoe_size_eu: '42' }, sku: 'X-1', price_minor: 100 }],
      },
      1
    )
    assert.deepEqual(fields(response.body), [['option_axes.0', 'not_allowed']])
    const values = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [
          { option_value_codes: { apparel_size: 's', color: 'black' }, sku: 'X-1', price_minor: 1 },
          { option_value_codes: { apparel_size: 'xxxxl' }, sku: 'X-2', price_minor: 1 },
        ],
      },
      1
    )
    assert.deepEqual(fields(values.body), [
      ['variants.0.option_value_codes', 'invalid'],
      ['variants.1.option_value_codes', 'unknown_value'],
    ])
  })

  test('T-CAT-103 the database refuses an option value of an attribute that is not an axis', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const color = await db.from('attributes').where('code', 'color').firstOrFail()
    const black = await db
      .from('attribute_values')
      .where({ attribute_id: color.id, code: 'black' })
      .firstOrFail()
    await refused(
      assert,
      (trx) =>
        trx.table('variant_option_values').insert({
          variant_id: product.variants[0].id,
          product_id: product.id,
          attribute_id: color.id,
          attribute_value_id: black.id,
        }),
      { code: '23503', constraint: 'variant_option_values_axis_fkey' },
      'a colour on a product that does not vary by colour'
    )
  })

  test('T-CAT-109 a variant row pointing at another shop’s product is 23503', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const other = await world()
    await refused(
      assert,
      (trx) =>
        trx.table('product_variants').insert({
          shop_id: other.shop.shopId,
          product_id: product.id,
          sku: 'CROSS-1',
          price_minor: 100,
          is_default: false,
          option_signature: 'apparel_size:s',
        }),
      { code: '23503', constraint: 'product_variants_product_fkey' },
      'another shop’s product'
    )
  })

  test('T-SEC-001 another shop’s product, or another shop’s variant id, is 404', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const other = await world()
    const theirs = await draft(other)
    const foreignProduct = await replace(
      w,
      theirs.id,
      { option_axes: [], variants: [{ option_value_codes: {}, sku: 'X-1', price_minor: 1 }] },
      1
    )
    assert.equal(foreignProduct.status, 404)
    const foreignVariant = await replace(
      w,
      product.id,
      {
        option_axes: [],
        variants: [
          { id: theirs.variants[0].id, option_value_codes: {}, sku: 'X-1', price_minor: 1 },
        ],
      },
      1
    )
    assert.equal(foreignVariant.status, 404)
    const row = await db.from('product_variants').where('id', theirs.variants[0].id).firstOrFail()
    assert.equal(row.sku, `DN-${theirs.public_id}`, 'the other shop’s variant is untouched')
  })

  test('T-API-004 no If-Match is 428; a stale version is 412 with current', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const body = { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S')] }
    const missing = await replace(w, product.id, body, null)
    assert.equal(missing.status, 428)
    const stale = await replace(w, product.id, body, 5)
    assert.equal(stale.status, 412)
    assert.equal(stale.body.current.version, 1)
  })

  test('T-SEC-003 is_default, status and unknown members are unknown_field', async ({ assert }) => {
    const w = await world()
    const product = await draft(w)
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [{ ...sized('s', 'TEE-S'), is_default: true, status: 'active' }],
        shop_id: w.shop.shopId,
      },
      1
    )
    assert.equal(response.status, 422)
    assert.sameDeepMembers(fields(response.body), [['shop_id', 'unknown_field']])
    const item = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [{ ...sized('s', 'TEE-S'), is_default: true, status: 'active' }],
      },
      1
    )
    assert.sameDeepMembers(fields(item.body), [
      ['variants.0.is_default', 'unknown_field'],
      ['variants.0.status', 'unknown_field'],
    ])
  })
})

test.group('T-CAT-106 variants with history and live products', (group) => {
  group.setup(async () => {
    await useJobBoss()
  })

  async function stockedTwoAxes(w: World) {
    const product = await draft(w)
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [
          {
            option_value_codes: { apparel_size: 's', color: 'black' },
            sku: 'T-S-BLK',
            price_minor: 1,
          },
          {
            option_value_codes: { apparel_size: 'm', color: 'black' },
            sku: 'T-M-BLK',
            price_minor: 1,
          },
        ],
      },
      1
    )
    const [small, medium] = response.body.data.variants as Variant[]
    await stock(w.shop.shopId, small.id, 3, w.shop.ownerId)
    return { product, small, medium }
  }

  test('T-CAT-106 the editor view gives each variant its option values and whether it has history', async ({
    assert,
  }) => {
    const w = await world()
    const fresh = await draft(w)
    const [defaultVariant] = fresh.variants as (Variant & {
      option_value_codes: Record<string, string>
      has_history: boolean
    })[]
    assert.deepEqual(defaultVariant.option_value_codes, {})
    assert.isFalse(defaultVariant.has_history)

    const { product, small, medium } = await stockedTwoAxes(w)
    const read = await send(w.owner, 'GET', productPath(w.shop.slug, product.id))
    assert.equal(read.status, 200)
    const variants = read.body.data.variants as (Variant & {
      option_value_codes: Record<string, string>
      has_history: boolean
    })[]
    const byId = new Map(variants.map((variant) => [variant.id, variant]))
    assert.deepEqual(byId.get(small.id)?.option_value_codes, { apparel_size: 's', color: 'black' })
    assert.isTrue(byId.get(small.id)?.has_history, 'stocked')
    assert.deepEqual(byId.get(medium.id)?.option_value_codes, { apparel_size: 'm', color: 'black' })
    assert.isFalse(byId.get(medium.id)?.has_history, 'never stocked')
  })

  test('T-CAT-106 a stocked product’s axes are fixed, but may be reordered in place', async ({
    assert,
  }) => {
    const w = await world()
    const { product, small, medium } = await stockedTwoAxes(w)
    const replaced = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [{ ...sized('s', 'T-S-BLK'), id: small.id }],
      },
      2
    )
    assert.equal(replaced.status, 409)
    assert.equal(replaced.body.code, 'CONFLICT')
    const swapped = await replace(
      w,
      product.id,
      {
        option_axes: ['color', 'apparel_size'],
        variants: [
          {
            id: small.id,
            option_value_codes: { apparel_size: 's', color: 'black' },
            sku: 'T-S-BLK',
            price_minor: 1,
          },
          {
            id: medium.id,
            option_value_codes: { apparel_size: 'm', color: 'black' },
            sku: 'T-M-BLK',
            price_minor: 1,
          },
        ],
      },
      2
    )
    assert.equal(swapped.status, 200, swapped.text)
    assert.deepEqual(swapped.body.data.option_axes, ['color', 'apparel_size'])
    assert.equal(swapped.body.data.variants[0].label, 'Colour: Black / Size: S')
    const signatures = await db
      .from('product_variants')
      .where('id', small.id)
      .select('option_signature')
      .firstOrFail()
    assert.equal(signatures.option_signature, 'apparel_size:s|color:black', 'the signature stays')
    const [, reorder] = await audits(product.id, 'product.variants_replace')
    assert.deepEqual(reorder.changes, {
      option_axes: { from: ['apparel_size', 'color'], to: ['color', 'apparel_size'] },
      created: 0,
      updated: 0,
      reactivated: 0,
      archived: 0,
      deleted: 0,
    })
  })

  test('T-CAT-106 on a stocked product, a variant without history is deleted, and a stocked one may change its SKU', async ({
    assert,
  }) => {
    const w = await world()
    const { product, small, medium } = await stockedTwoAxes(w)
    const response = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [
          {
            id: small.id,
            option_value_codes: { apparel_size: 's', color: 'black' },
            sku: 'T-S-BLK-2',
            price_minor: 1,
          },
        ],
      },
      2
    )
    assert.equal(response.status, 200, response.text)
    assert.lengthOf(await db.from('product_variants').where('id', medium.id), 0)
    const kept = response.body.data.variants.find((variant: Variant) => variant.id === small.id)
    assert.deepEqual([kept.sku, kept.on_hand], ['T-S-BLK-2', 3])
  })

  test('T-CAT-106 an order line is history too: its variant is archived, not deleted', async ({
    assert,
  }) => {
    const { courierWorld } = await import('#tests/support/courier')
    const { signIn } = await import('#tests/support/courier_http')
    const ordered = await courierWorld()
    const line = await db
      .from('order_items')
      .where('shop_order_id', ordered.shopOrder.id)
      .firstOrFail()
    const owner = await signIn(ordered.ownerId)
    const product = await db.from('products').where('id', line.product_id).firstOrFail()
    const response = await send(
      owner,
      'PUT',
      `/api/v1/seller/shops/${ordered.slug}/products/${line.product_id}/variants`,
      { option_axes: [], variants: [{ option_value_codes: {}, sku: 'NEW-1', price_minor: 100 }] },
      { 'If-Match': `"${product.version}"` }
    )
    assert.equal(response.status, 200, response.text)
    const row = await db.from('product_variants').where('id', line.variant_id).firstOrFail()
    assert.equal(row.status, 'archived')
  })

  test('T-CAT-106 an inactive value stays on the variant that has it; a new variant cannot take it', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    const first = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S')] },
      1
    )
    const [small] = first.body.data.variants as Variant[]
    const size = await db.from('attributes').where('code', 'apparel_size').firstOrFail()
    await db
      .from('attribute_values')
      .where({ attribute_id: size.id, code: 's' })
      .update({ is_active: false })
    const kept = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [{ ...sized('s', 'TEE-S', { price_minor: 7 }), id: small.id }],
      },
      2
    )
    assert.equal(kept.status, 200, kept.text)
    const fresh = await draft(w)
    const refusedNew = await replace(
      w,
      fresh.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'NEW-S')] },
      1
    )
    assert.deepEqual(fields(refusedNew.body), [['variants.0.option_value_codes', 'unknown_value']])
  })

  test('T-CAT-106 an axis the product has stays usable after the platform drops its rule', async ({
    assert,
  }) => {
    const w = await world()
    const product = await draft(w)
    await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S')] },
      1
    )
    const size = await db.from('attributes').where('code', 'apparel_size').firstOrFail()
    // The rule comes from `tops`; dropped, t-shirts no longer offer a size axis.
    await db.from('category_attributes').where('attribute_id', size.id).delete()
    const response = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'TEE-S'), sized('m', 'TEE-M')] },
      2
    )
    assert.equal(response.status, 200, response.text)
    const fresh = await draft(w)
    const refusedNew = await replace(
      w,
      fresh.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'NEW-S')] },
      1
    )
    assert.deepEqual(fields(refusedNew.body), [['option_axes.0', 'not_allowed']])
  })

  test('T-CAT-106 a stocked variant left out is archived, keeps its options, and comes back by id', async ({
    assert,
  }) => {
    const w = await world()
    const { product, small, medium } = await stockedTwoAxes(w)
    const twoAxes = (size: string, sku: string, id?: string) => ({
      ...(id ? { id } : {}),
      option_value_codes: { apparel_size: size, color: 'black' },
      sku,
      price_minor: 1,
    })
    const dropped = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size', 'color'], variants: [twoAxes('m', 'T-M-BLK', medium.id)] },
      2
    )
    assert.equal(dropped.status, 200, dropped.text)
    const smallRow = await db.from('product_variants').where('id', small.id).firstOrFail()
    assert.equal(smallRow.status, 'archived', 'stocked: archived, not deleted')
    const [, audit] = await audits(product.id, 'product.variants_replace')
    assert.equal(audit.changes.archived, 1)

    const changedOptions = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [twoAxes('l', 'T-S-BLK', small.id), twoAxes('m', 'T-M-BLK', medium.id)],
      },
      3
    )
    assert.deepEqual(fields(changedOptions.body), [['variants.0.option_value_codes', 'history']])

    const back = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [twoAxes('s', 'T-S-BLK', small.id), twoAxes('m', 'T-M-BLK', medium.id)],
      },
      3
    )
    assert.equal(back.status, 200, back.text)
    const restored = back.body.data.variants.find((variant: Variant) => variant.id === small.id)
    assert.deepEqual([restored.status, restored.on_hand], ['active', 3])
    const [, , third] = await audits(product.id, 'product.variants_replace')
    assert.equal(third.changes.reactivated, 1)
  })

  test('T-CAT-106 re-activation is refused while another active variant holds its SKU', async ({
    assert,
  }) => {
    const w = await world()
    const { product, small, medium } = await stockedTwoAxes(w)
    await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [
          {
            id: medium.id,
            option_value_codes: { apparel_size: 'm', color: 'black' },
            sku: 'T-M-BLK',
            price_minor: 1,
          },
        ],
      },
      2
    )
    const other = await draft(w)
    await replace(
      w,
      other.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'T-S-BLK')] },
      1
    )
    const back = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size', 'color'],
        variants: [
          {
            id: small.id,
            option_value_codes: { apparel_size: 's', color: 'black' },
            sku: 'T-S-BLK',
            price_minor: 1,
          },
          {
            id: medium.id,
            option_value_codes: { apparel_size: 'm', color: 'black' },
            sku: 'T-M-BLK',
            price_minor: 1,
          },
        ],
      },
      3
    )
    assert.deepEqual(fields(back.body), [['variants.0.sku', 'unique']])
  })

  test('T-CAT-106 a live product keeps its required axes and a price above zero', async ({
    assert,
  }) => {
    const w = await world()
    const product = await ProductFactory.merge({ shopId: w.shop.shopId })
      .apply('published')
      .create()
    const zero = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'LIVE-S', { price_minor: 0 })] },
      1
    )
    assert.deepEqual(fields(zero.body), [['variants.0.price_minor', 'required']])
    const noSize = await replace(
      w,
      product.id,
      { option_axes: [], variants: [{ option_value_codes: {}, sku: 'LIVE-1', price_minor: 100 }] },
      1
    )
    assert.deepEqual(fields(noSize.body), [['option_axes', 'required']])
    const empty = await replace(w, product.id, { option_axes: ['apparel_size'], variants: [] }, 1)
    assert.equal(empty.status, 422)
    assert.deepInclude(
      fields(empty.body).map(([field]) => field),
      'variants',
      'an empty active set is refused'
    )
    const defaultBeside = await replace(
      w,
      product.id,
      {
        option_axes: ['apparel_size'],
        variants: [
          sized('s', 'LIVE-S'),
          { option_value_codes: {}, sku: 'LIVE-D', price_minor: 100 },
        ],
      },
      1
    )
    assert.deepEqual(fields(defaultBeside.body), [['variants.1.option_value_codes', 'invalid']])
    const row = await db.from('products').where('id', product.id).firstOrFail()
    assert.equal(row.version, 1)

    await db.from('products').where('id', product.id).update({ status: 'unpublished' })
    // `unpublished` is live too: a zero price is refused there as well.
    const zeroUnpublished = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'LIVE-S', { price_minor: 0 })] },
      1
    )
    assert.deepEqual(fields(zeroUnpublished.body), [['variants.0.price_minor', 'required']])
    const priced = await replace(
      w,
      product.id,
      { option_axes: ['apparel_size'], variants: [sized('s', 'LIVE-S')] },
      1
    )
    assert.equal(priced.status, 200, priced.text)
    assert.equal(priced.body.data.status, 'unpublished')
  })
})
