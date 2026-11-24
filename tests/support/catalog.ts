import db from '@adonisjs/lucid/services/db'
import type { Browser } from '#tests/support/browser'
import { key, send, signIn } from '#tests/support/courier_http'
import { queued } from '#tests/support/jobs'
import { createOwnerShop, type OwnerShop } from '#tests/support/shops'

/*
 * Helpers of the seller catalog tests over HTTP (docs/06 §13.5; R1-S part
 * 2): an active owner's shop signed in, a draft body in the seeded `t-shirts`
 * leaf, and readers for the rows the operations write.
 */
export const productsPath = (slug: string) => `/api/v1/seller/shops/${slug}/products`
export const productPath = (slug: string, id: string) => `${productsPath(slug)}/${id}`

export const fields = (body: { errors?: { field: string; code: string }[] }) =>
  (body.errors ?? []).map((item) => [item.field, item.code])

export async function categoryId(slug: string) {
  const row = await db.from('categories').where('slug', slug).select('id').firstOrFail()
  return row.id as string
}

export async function draftBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Organic cotton crew tee',
    description: '180 gsm, pre-shrunk.',
    category_id: await categoryId('t-shirts'),
    brand_id: null,
    attributes: [
      { attribute_code: 'audience', value_codes: ['men', 'women'] },
      { attribute_code: 'material', value_codes: ['cotton'] },
    ],
    manufacturer_name: 'Kathmandu Threads Pvt. Ltd.',
    is_imported: false,
    country_of_origin: null,
    warranty_text: null,
    care_and_precautions: 'Wash cold, dry in shade.',
    ...overrides,
  }
}

export type World = { shop: OwnerShop; owner: Browser }

export async function world(): Promise<World> {
  const shop = await createOwnerShop()
  return { shop, owner: await signIn(shop.ownerId) }
}

export async function create(w: World, body: Record<string, unknown>, idempotencyKey = key()) {
  return send(w.owner, 'POST', productsPath(w.shop.slug), body, {
    'Idempotency-Key': idempotencyKey,
  })
}

export const audits = (productId: string, action: string) =>
  db.from('audit_logs').where({ subject_id: productId, action }).orderBy('id')

// Brands are platform reference data; none is seeded yet, so tests insert their own.
export async function insertBrand(status = 'active', requiresModeration = false) {
  const slug = `test-brand-${Math.random().toString(36).slice(2, 10)}`
  const [row] = await db
    .table('brands')
    .insert({ slug, name: `Test brand ${slug}`, status, requires_moderation: requiresModeration })
    .returning('id')
  return row.id as string
}

export async function jobsFor(productId: string) {
  const jobs = await queued<{ product_id: string }>('catalog.refresh_listing')
  return jobs.filter((job) => job.data.product_id === productId)
}
