import type { CategoryTreeNode, FilterAttribute } from '#modules/catalog/queries'

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
