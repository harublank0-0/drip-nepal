import type { CategoryTreeNode, FilterAttribute, ListingCardRow } from '#modules/catalog/queries'

/*
 * The storefront's reference reads as the public API answers them (docs/06
 * §13.2 `listCategories`, `listAttributes`; R1-S part 3a): the category tree
 * as `{id, slug, name, children}`, and each filterable attribute with its
 * values and swatches (`swatch_hex` null when a value has none).
 */
export function categoryNodeJson(node: CategoryTreeNode): Record<string, unknown> {
  return {
    id: node.id,
    slug: node.slug,
    name: node.name,
    children: node.children.map(categoryNodeJson),
  }
}

export function filterAttributeJson(attribute: FilterAttribute) {
  return {
    code: attribute.code,
    name: attribute.name,
    input: attribute.input,
    values: attribute.values.map((value) => ({
      code: value.code,
      label: value.label,
      swatch_hex: value.swatchHex,
    })),
  }
}

const money = (amountMinor: number, currency: string) => ({ amount_minor: amountMinor, currency })

/*
 * A storefront card (docs/06 §13.2 `listProducts`, §14.1; openapi
 * `ListingCard`; R1-S part 3b): every field from its `product_listings`
 * column, prices in integer paisa (ADR-0007), the brand null for own label,
 * and the position-1 image's alt text and derived keys by width.
 */
export function listingCardJson(row: ListingCardRow) {
  return {
    public_id: row.public_id,
    slug: row.slug,
    title: row.title,
    shop: { slug: row.shop_slug, name: row.shop_name },
    brand:
      row.brand_slug !== null && row.brand_name !== null
        ? { slug: row.brand_slug, name: row.brand_name }
        : null,
    price_min: money(row.min_price_minor, row.currency),
    price_max: money(row.max_price_minor, row.currency),
    compare_at:
      row.compare_at_price_minor === null ? null : money(row.compare_at_price_minor, row.currency),
    in_stock: row.in_stock,
    image: { alt: row.primary_image_alt, srcset_keys: row.primary_image_keys },
    published_at: row.published_at.toISOString(),
  }
}
