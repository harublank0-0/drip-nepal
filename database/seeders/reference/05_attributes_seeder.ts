import { BaseSeeder } from '@adonisjs/lucid/seeders'
import type { AttributeInput } from '#modules/catalog/domain/attribute_input'
import type { AttributeScope } from '#modules/catalog/domain/attribute_scope'

/*
 * The attribute catalogue of docs/04 §21.2 [Assumption; Open OD-15]:
 * `attributes` upserted by `code`, `attribute_values` by `(attribute, code)`
 * (docs/04a §7.2, §7.3, docs/09 §8.8). `position` follows the order of the
 * tables. `kids_age` is R2 and not seeded (docs/04 §3.8). Never deletes.
 *
 * `code`, `scope` and `input` are immutable once seeded: option signatures
 * and filter URLs use the code, and existing values depend on the scope and
 * input, so the seeder refuses to change them. Only `color` values carry a
 * swatch (a seeder rule, docs/04a §7.3).
 */

type Value = { code: string; label: string; swatch?: string }
type AttributeRow = {
  code: string
  name: string
  scope: AttributeScope
  input: AttributeInput
  filterable: boolean
  values: Value[]
}

const value = (code: string, label: string, swatch?: string): Value => ({ code, label, swatch })

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)

export const ATTRIBUTES: AttributeRow[] = [
  {
    code: 'audience',
    name: 'Audience',
    scope: 'product',
    input: 'multi',
    filterable: true,
    values: [value('men', 'Men'), value('women', 'Women'), value('kids', 'Kids')],
  },
  {
    code: 'material',
    name: 'Material',
    scope: 'product',
    input: 'multi',
    filterable: false,
    values: [
      value('cotton', 'Cotton'),
      value('polyester', 'Polyester'),
      value('nylon', 'Nylon'),
      value('wool', 'Wool'),
      value('linen', 'Linen'),
      value('silk', 'Silk'),
      value('denim', 'Denim'),
      value('viscose', 'Viscose'),
      value('leather', 'Leather'),
      value('synthetic_leather', 'Synthetic leather (PU)'),
      value('canvas', 'Canvas'),
      value('rubber', 'Rubber'),
      value('metal', 'Metal'),
      value('dhaka', 'Dhaka'),
      value('pashmina', 'Pashmina'),
      value('allo', 'Allo (Himalayan nettle)'),
      value('hemp', 'Hemp'),
      value('other', 'Other'),
    ],
  },
  {
    code: 'fit',
    name: 'Fit',
    scope: 'product',
    input: 'single',
    filterable: false,
    values: [
      value('regular', 'Regular'),
      value('slim', 'Slim'),
      value('relaxed', 'Relaxed'),
      value('oversized', 'Oversized'),
    ],
  },
  {
    code: 'sleeve_length',
    name: 'Sleeve length',
    scope: 'product',
    input: 'single',
    filterable: false,
    values: [
      value('sleeveless', 'Sleeveless'),
      value('short', 'Short'),
      value('three_quarter', 'Three-quarter'),
      value('long', 'Long'),
    ],
  },
  {
    code: 'apparel_size',
    name: 'Size',
    scope: 'variant',
    input: 'single',
    filterable: true,
    values: [
      value('xs', 'XS'),
      value('s', 'S'),
      value('m', 'M'),
      value('l', 'L'),
      value('xl', 'XL'),
      value('xxl', '2XL'),
      value('3xl', '3XL'),
      value('free_size', 'Free Size'),
    ],
  },
  {
    code: 'shoe_size_eu',
    name: 'Shoe size (EU)',
    scope: 'variant',
    input: 'single',
    filterable: true,
    values: range(35, 47).map((size) => value(`${size}`, `EU ${size}`)),
  },
  {
    code: 'waist_size_in',
    name: 'Waist (inches)',
    scope: 'variant',
    input: 'single',
    filterable: true,
    values: [...range(26, 34), 36, 38, 40].map((size) => value(`${size}`, `${size} in`)),
  },
  {
    code: 'color',
    name: 'Colour',
    scope: 'variant',
    input: 'single',
    filterable: true,
    values: [
      value('black', 'Black', '#111111'),
      value('white', 'White', '#ffffff'),
      value('off_white', 'Off-white', '#f5f1e6'),
      value('grey', 'Grey', '#8e8e93'),
      value('charcoal', 'Charcoal', '#36454f'),
      value('navy', 'Navy', '#1f2a44'),
      value('blue', 'Blue', '#2563eb'),
      value('sky_blue', 'Sky blue', '#87ceeb'),
      value('green', 'Green', '#15803d'),
      value('olive', 'Olive', '#6b7a2a'),
      value('maroon', 'Maroon', '#7f1d1d'),
      value('red', 'Red', '#dc2626'),
      value('pink', 'Pink', '#ec4899'),
      value('purple', 'Purple', '#7c3aed'),
      value('yellow', 'Yellow', '#facc15'),
      value('mustard', 'Mustard', '#d4a017'),
      value('orange', 'Orange', '#f97316'),
      value('brown', 'Brown', '#78350f'),
      value('beige', 'Beige', '#e8d8b8'),
      value('gold', 'Gold', '#c9a227'),
      value('silver', 'Silver', '#c0c0c0'),
      value('multicolor', 'Multicolour'),
      value('printed', 'Printed'),
    ],
  },
]

export default class AttributesSeeder extends BaseSeeder {
  async run() {
    for (const attribute of ATTRIBUTES) {
      if (attribute.code !== 'color' && attribute.values.some((v) => v.swatch !== undefined)) {
        throw new Error(`only color values carry a swatch; ${attribute.code} has one`)
      }
    }

    await this.client.transaction(async (trx) => {
      for (const [index, attribute] of ATTRIBUTES.entries()) {
        await trx.rawQuery(
          `INSERT INTO attributes (code, name, scope, input, is_filterable, position)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT (code) DO UPDATE
              SET name = EXCLUDED.name, is_filterable = EXCLUDED.is_filterable,
                  position = EXCLUDED.position
            WHERE (attributes.name, attributes.is_filterable, attributes.position)
                  IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.is_filterable, EXCLUDED.position)`,
          [
            attribute.code,
            attribute.name,
            attribute.scope,
            attribute.input,
            attribute.filterable,
            index + 1,
          ]
        )
        const result = await trx.rawQuery(
          'SELECT id, scope, input FROM attributes WHERE code = ?',
          [attribute.code]
        )
        const stored = result.rows[0] as { id: string; scope: string; input: string }
        if (stored.scope !== attribute.scope || stored.input !== attribute.input) {
          throw new Error(
            `attribute ${attribute.code} is seeded as ${stored.scope}/${stored.input}; its scope and input cannot change`
          )
        }

        for (const [position, item] of attribute.values.entries()) {
          await trx.rawQuery(
            `INSERT INTO attribute_values (attribute_id, code, label, position, swatch_hex, is_active)
             VALUES (?, ?, ?, ?, NULLIF(?, ''), true)
             ON CONFLICT (attribute_id, code) DO UPDATE
                SET label = EXCLUDED.label, position = EXCLUDED.position,
                    swatch_hex = EXCLUDED.swatch_hex, is_active = true
              WHERE (attribute_values.label, attribute_values.position,
                     attribute_values.swatch_hex, attribute_values.is_active)
                    IS DISTINCT FROM (EXCLUDED.label, EXCLUDED.position, EXCLUDED.swatch_hex, true)`,
            // '' stands for no swatch: NULLIF stores it as null
            [stored.id, item.code, item.label, position + 1, item.swatch ?? '']
          )
        }
      }
    })
  }
}
