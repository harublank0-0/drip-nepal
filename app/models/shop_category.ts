import { ShopCategorySchema } from '#database/schema'

/*
 * docs/04a §6.8 (shops), keyed by `code`. A shop's categories are read
 * through `Shop.categories`.
 */
export default class ShopCategory extends ShopCategorySchema {}
