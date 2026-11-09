import { BaseSeeder } from '@adonisjs/lucid/seeders'
import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/*
 * The fashion category tree of docs/04 §21.1 [Assumption; Open OD-15],
 * upserted by `slug` (docs/04 §20.3, docs/04a §7.1, docs/09 §8.8). `path`
 * and `depth` are computed top-down from the parent, which also makes a
 * cycle impossible. `position` is the order among siblings, as listed.
 *
 * Never deletes: a category that is no longer in the tree is set
 * `is_active = false`. Refuses, and changes nothing, when it would
 *   - add a child under a category that has products (docs/04 §3.6),
 *   - deactivate a category that has products that are not `archived`
 *     (docs/04a §7.1), or
 *   - move a category to another parent. A move rewrites the paths of the
 *     subtree, inserts a `slug_redirects` row and queues
 *     `catalog.rebuild_listings` (docs/04a §7.1); that job does not exist
 *     before M3, so this seeder does not move categories yet.
 */

export type CategoryNode = { slug: string; name: string; children?: CategoryNode[] }

const leaves = (...pairs: [string, string][]): CategoryNode[] =>
  pairs.map(([name, slug]) => ({ name, slug }))

export const CATEGORY_TREE: CategoryNode[] = [
  {
    name: 'Clothing',
    slug: 'clothing',
    children: [
      {
        name: 'Tops',
        slug: 'tops',
        children: leaves(
          ['T-Shirts', 't-shirts'],
          ['Shirts', 'shirts'],
          ['Polo Shirts', 'polo-shirts'],
          ['Hoodies & Sweatshirts', 'hoodies-sweatshirts'],
          ['Sweaters & Cardigans', 'sweaters-cardigans'],
          ['Jackets', 'jackets'],
          ['Tops & Blouses', 'tops-blouses']
        ),
      },
      {
        name: 'Bottoms',
        slug: 'bottoms',
        children: leaves(
          ['Cargo Pants', 'cargo-pants'],
          ['Jeans', 'jeans'],
          ['Trousers & Chinos', 'trousers-chinos'],
          ['Joggers & Track Pants', 'joggers'],
          ['Shorts', 'shorts'],
          ['Skirts', 'skirts']
        ),
      },
      ...leaves(
        ['Dresses & Jumpsuits', 'dresses-jumpsuits'],
        ['Activewear', 'activewear'],
        ['Innerwear & Sleepwear', 'innerwear-sleepwear']
      ),
    ],
  },
  {
    name: 'Traditional Wear',
    slug: 'traditional-wear',
    children: leaves(
      ['Kurtas', 'kurtas'],
      ['Kurta Suruwal', 'kurta-suruwal'],
      ['Sarees', 'sarees'],
      ['Daura Suruwal', 'daura-suruwal'],
      ['Lehengas', 'lehengas'],
      ['Dhaka Topi', 'dhaka-topi'],
      ['Shawls & Pashmina', 'shawls-pashmina']
    ),
  },
  {
    name: 'Footwear',
    slug: 'footwear',
    children: leaves(
      ['Sneakers', 'sneakers'],
      ['Casual Shoes', 'casual-shoes'],
      ['Formal Shoes', 'formal-shoes'],
      ['Boots', 'boots'],
      ['Sandals & Slippers', 'sandals-slippers'],
      ['Heels & Flats', 'heels-flats'],
      ['Sports Shoes', 'sports-shoes']
    ),
  },
  {
    name: 'Bags',
    slug: 'bags',
    children: leaves(
      ['Backpacks', 'backpacks'],
      ['Handbags & Totes', 'handbags-totes'],
      ['Crossbody & Sling Bags', 'crossbody-bags'],
      ['Wallets', 'wallets']
    ),
  },
  {
    name: 'Watches',
    slug: 'watches',
    children: leaves(['Analog Watches', 'analog-watches'], ['Digital Watches', 'digital-watches']),
  },
  {
    name: 'Accessories',
    slug: 'accessories',
    children: leaves(
      ['Caps & Hats', 'caps-hats'],
      ['Sunglasses', 'sunglasses'],
      ['Belts', 'belts'],
      ['Jewellery', 'jewellery'],
      ['Scarves & Stoles', 'scarves-stoles'],
      ['Socks', 'socks']
    ),
  },
]

export type PlannedCategory = {
  slug: string
  name: string
  parentSlug: string | null
  path: string
  depth: number
  position: number
}

/** The tree as rows, parents before children, with `path` and `depth` computed. */
export function planCategories(tree: CategoryNode[]): PlannedCategory[] {
  const planned: PlannedCategory[] = []
  const seen = new Set<string>()
  const walk = (nodes: CategoryNode[], parent: PlannedCategory | null) => {
    for (const [index, node] of nodes.entries()) {
      if (seen.has(node.slug)) throw new Error(`category slug ${node.slug} appears twice`)
      seen.add(node.slug)
      const row: PlannedCategory = {
        slug: node.slug,
        name: node.name,
        parentSlug: parent?.slug ?? null,
        path: `${parent?.path ?? '/'}${node.slug}/`,
        depth: (parent?.depth ?? 0) + 1,
        position: index + 1,
      }
      planned.push(row)
      walk(node.children ?? [], row)
    }
  }
  walk(tree, null)
  return planned
}

export class CategorySeederRefusal extends Error {}

type ExistingCategory = {
  id: string
  slug: string
  parent_id: string | null
  name: string
  position: number
  is_active: boolean
}

async function hasProducts(client: QueryClientContract, categoryId: string, liveOnly: boolean) {
  const result = await client.rawQuery(
    `SELECT EXISTS (SELECT 1 FROM products WHERE category_id = ?
       ${liveOnly ? "AND status <> 'archived'" : ''}) AS found`,
    [categoryId]
  )
  return result.rows[0].found as boolean
}

/** Upserts `tree` in one transaction; exported so a test can seed another tree. */
export async function seedCategories(client: QueryClientContract, tree = CATEGORY_TREE) {
  const planned = planCategories(tree)
  await client.transaction(async (trx) => {
    const result = await trx.rawQuery(
      'SELECT id, slug::text AS slug, parent_id, name, position, is_active FROM categories'
    )
    const existing = new Map<string, ExistingCategory>(
      (result.rows as ExistingCategory[]).map((row) => [row.slug, row])
    )
    const idBySlug = new Map<string, string>()

    for (const row of planned) {
      const parentId = row.parentSlug === null ? null : idBySlug.get(row.parentSlug)!
      const current = existing.get(row.slug)
      if (current) {
        if (current.parent_id !== parentId) {
          throw new CategorySeederRefusal(
            `category ${row.slug} would move to another parent; moves are not supported yet (docs/04a §7.1)`
          )
        }
        await trx.rawQuery(
          `UPDATE categories SET name = ?, position = ?, is_active = true
            WHERE id = ? AND (name, position, is_active) IS DISTINCT FROM (?, ?, true)`,
          [row.name, row.position, current.id, row.name, row.position]
        )
        idBySlug.set(row.slug, current.id)
        continue
      }
      if (parentId !== null && (await hasProducts(trx, parentId, false))) {
        throw new CategorySeederRefusal(
          `category ${row.parentSlug} has products, so ${row.slug} cannot be added under it (docs/04 §3.6)`
        )
      }
      const [inserted] = await trx
        .insertQuery()
        .table('categories')
        .insert({
          parent_id: parentId,
          slug: row.slug,
          name: row.name,
          path: row.path,
          depth: row.depth,
          position: row.position,
        })
        .returning('id')
      idBySlug.set(row.slug, inserted.id)
    }

    for (const current of existing.values()) {
      if (idBySlug.has(current.slug) || !current.is_active) continue
      if (await hasProducts(trx, current.id, true)) {
        throw new CategorySeederRefusal(
          `category ${current.slug} has products that are not archived, so it cannot be deactivated (docs/04a §7.1)`
        )
      }
      await trx.rawQuery('UPDATE categories SET is_active = false WHERE id = ?', [current.id])
    }
  })
}

export default class CategoriesSeeder extends BaseSeeder {
  async run() {
    await seedCategories(this.client)
  }
}
