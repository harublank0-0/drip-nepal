import { BaseSeeder } from '@adonisjs/lucid/seeders'
import type { CategoryAttributeUsage } from '#modules/catalog/domain/category_attribute_usage'

/*
 * The category attribute rules of docs/04 §21.3 [Assumption; Open OD-15],
 * upserted by `(category, attribute)` (docs/04a §7.4, docs/09 §8.8). A rule
 * on a category applies to every leaf below it, the deepest row winning
 * (docs/04 §3.7). `position` is the form order within a category: the order
 * of the §21.3 rows that name it.
 *
 * Checks before writing: every category and attribute exists (seeders 04
 * and 05 run first), and `usage` matches the attribute's scope (`product`
 * needs a product-scope attribute, `variant_axis` a variant-scope one;
 * docs/04a §7.4). Never deletes: removing a rule needs the compliance report
 * of docs/04 §3.7, which arrives with the admin UI (R2).
 */

type Rule = {
  categories: readonly string[]
  attribute: string
  usage: CategoryAttributeUsage
  required: boolean
}

const TOP_LEVEL = ['clothing', 'traditional-wear', 'footwear', 'bags', 'watches', 'accessories']

export const CATEGORY_ATTRIBUTE_RULES: Rule[] = [
  { categories: TOP_LEVEL, attribute: 'audience', usage: 'product', required: true },
  { categories: TOP_LEVEL, attribute: 'material', usage: 'product', required: true },
  { categories: TOP_LEVEL, attribute: 'color', usage: 'variant_axis', required: false },
  { categories: ['clothing'], attribute: 'fit', usage: 'product', required: false },
  { categories: ['tops'], attribute: 'apparel_size', usage: 'variant_axis', required: true },
  { categories: ['tops'], attribute: 'sleeve_length', usage: 'product', required: false },
  {
    categories: ['jeans', 'trousers-chinos'],
    attribute: 'waist_size_in',
    usage: 'variant_axis',
    required: true,
  },
  {
    categories: [
      'cargo-pants',
      'joggers',
      'shorts',
      'skirts',
      'dresses-jumpsuits',
      'activewear',
      'innerwear-sleepwear',
    ],
    attribute: 'apparel_size',
    usage: 'variant_axis',
    required: true,
  },
  {
    categories: ['kurtas', 'kurta-suruwal', 'daura-suruwal', 'lehengas'],
    attribute: 'apparel_size',
    usage: 'variant_axis',
    required: true,
  },
  { categories: ['footwear'], attribute: 'shoe_size_eu', usage: 'variant_axis', required: true },
  { categories: ['caps-hats'], attribute: 'apparel_size', usage: 'variant_axis', required: false },
]

const SCOPE_FOR_USAGE: Record<CategoryAttributeUsage, string> = {
  product: 'product',
  variant_axis: 'variant',
}

export default class CategoryAttributesSeeder extends BaseSeeder {
  async run() {
    await this.client.transaction(async (trx) => {
      const categories = await trx.rawQuery('SELECT id, slug::text AS slug FROM categories')
      const categoryIds = new Map<string, string>(
        (categories.rows as { id: string; slug: string }[]).map((row) => [row.slug, row.id])
      )
      const attributes = await trx.rawQuery('SELECT id, code, scope FROM attributes')
      const attributeRows = new Map<string, { id: string; scope: string }>(
        (attributes.rows as { id: string; code: string; scope: string }[]).map((row) => [
          row.code,
          row,
        ])
      )

      const positions = new Map<string, number>()
      for (const rule of CATEGORY_ATTRIBUTE_RULES) {
        const attribute = attributeRows.get(rule.attribute)
        if (!attribute) throw new Error(`attribute ${rule.attribute} is not seeded`)
        if (attribute.scope !== SCOPE_FOR_USAGE[rule.usage]) {
          throw new Error(
            `${rule.attribute} has scope ${attribute.scope}, so it cannot be used as ${rule.usage}`
          )
        }
        for (const slug of rule.categories) {
          const categoryId = categoryIds.get(slug)
          if (!categoryId) throw new Error(`category ${slug} is not seeded`)
          const position = (positions.get(slug) ?? 0) + 1
          positions.set(slug, position)
          await trx.rawQuery(
            `INSERT INTO category_attributes (category_id, attribute_id, usage, is_required, position)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (category_id, attribute_id) DO UPDATE
                SET usage = EXCLUDED.usage, is_required = EXCLUDED.is_required,
                    position = EXCLUDED.position
              WHERE (category_attributes.usage, category_attributes.is_required,
                     category_attributes.position)
                    IS DISTINCT FROM (EXCLUDED.usage, EXCLUDED.is_required, EXCLUDED.position)`,
            [categoryId, attribute.id, rule.usage, rule.required, position]
          )
        }
      }
    })
  }
}
