/*
 * draft: only the shop sees it. active: listed on the storefront (if the
 * shop is active). archived: removed by the shop, kept for order history.
 */
export const ProductStatus = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const

export type ProductStatus = (typeof ProductStatus)[keyof typeof ProductStatus]
export const ProductStatusValues = Object.values(ProductStatus)

export const ProductGender = {
  MEN: 'men',
  WOMEN: 'women',
  UNISEX: 'unisex',
} as const

export type ProductGender = (typeof ProductGender)[keyof typeof ProductGender]
export const ProductGenderValues = Object.values(ProductGender)

/*
 * A variant stops being sold when it is archived (removed from the product
 * form) but stays in the database so past orders still point at it.
 */
export const VariantStatus = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
} as const

export type VariantStatus = (typeof VariantStatus)[keyof typeof VariantStatus]

/*
 * The variant options shops can set. Each one is an `attributes` row.
 */
export const VariantAttributes = {
  SIZE: { name: 'Size', slug: 'size', filterable: true },
  COLOR: { name: 'Color', slug: 'color', filterable: true },
} as const

export const MAX_PRODUCT_IMAGES = 8
