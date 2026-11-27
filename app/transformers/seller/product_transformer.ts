import type {
  ProductEditorData,
  ProductFormOptions,
  ProductListItem,
} from '#modules/catalog/queries'
import { missingForSubmit } from '#modules/catalog/domain/submit_readiness'
import type { VariantStock } from '#modules/inventory/queries'

/*
 * The seller views of a product (docs/06 §13.5, §14.2; `SellerProduct` and
 * `SellerProductListItem` in openapi.yaml; docs/09 §12.9; R1-S part 2a).
 * One shape for `createProduct`, `getShopProduct` and `updateProduct`, so
 * the editor, the API read and a create's answer agree. Money is
 * `{ amount_minor, currency }` in integer paisa (ADR-0007). `on_hand` is
 * shop-confidential and appears in seller views only (docs/04a §8.1).
 * `missing_for_submit` comes from the same pure function as the submit
 * refusal (T-CAT-002). Since R1-S part 2f-ii each variant also carries its
 * `option_value_codes` (axis code → value code, as `replaceProductVariants`
 * takes them) and `has_history` (an inventory movement or an order line,
 * so its options stay as they are and the product's axes are fixed, 04a
 * §7.8, §7.9), which the variant editor needs.
 */
const money = (amountMinor: number) => ({ amount_minor: amountMinor, currency: 'NPR' as const })

export function sellerProductJson(data: ProductEditorData, stock: VariantStock) {
  const { product: p } = data
  return {
    id: p.id,
    public_id: p.publicId,
    status: p.status,
    version: p.version,
    title: p.title,
    description: p.description,
    category: { id: data.category.id, path: data.category.path },
    brand: data.brand ? { id: data.brand.id, name: data.brand.name } : null,
    attributes: data.attributes.map((attribute) => ({
      attribute_code: attribute.code,
      value_codes: attribute.valueCodes,
    })),
    manufacturer_name: p.manufacturerName,
    is_imported: p.isImported,
    country_of_origin: p.countryOfOrigin,
    warranty_text: p.warrantyText,
    care_and_precautions: p.careAndPrecautions,
    rejection_reason: p.rejectionReason,
    option_axes: data.optionAxes,
    variants: data.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      label: variant.label,
      status: variant.status,
      price: money(variant.priceMinor),
      compare_at_price:
        variant.compareAtPriceMinor === null ? null : money(variant.compareAtPriceMinor),
      weight_grams: variant.weightGrams,
      is_default: variant.isDefault,
      on_hand: stock.onHand.get(variant.id) ?? 0,
      option_value_codes: variant.codes,
      has_history: stock.history.has(variant.id),
    })),
    media: data.media.map((item) => ({
      media_asset_id: item.mediaAssetId,
      position: item.position,
      alt_text: item.altText,
      color_value_id: item.colorValueId,
      keys: item.keys,
    })),
    missing_for_submit: missingForSubmit(p, data.variants, data.readyMediaCount),
    updated_at: p.updatedAt.toISOString(),
  }
}

export function sellerProductListItemJson(item: ProductListItem) {
  return {
    id: item.id,
    public_id: item.publicId,
    title: item.title,
    status: item.status,
    version: item.version,
    variant_count: item.variantCount,
    updated_at: item.updatedAt.toISOString(),
  }
}

/*
 * What the product form chooses from (`productFormOptions`; the seller
 * product pages of docs/08 §2.5, R1-S part 2f-i): the three props
 * `categories`, `attributes` and `brands`, public reference data. A
 * category's `label` joins its names from the top level down with " › ".
 */
export function productFormOptionsJson(options: ProductFormOptions) {
  return {
    categories: options.categories.map((category) => ({
      id: category.id,
      label: category.names.join(' › '),
      is_active: category.isActive,
      rules: category.rules.map((rule) => ({
        attribute_code: rule.code,
        usage: rule.usage,
        is_required: rule.isRequired,
      })),
    })),
    attributes: options.attributes.map((attribute) => ({
      code: attribute.code,
      name: attribute.name,
      input: attribute.input,
      values: attribute.values.map((value) => ({
        id: value.id,
        code: value.code,
        label: value.label,
        swatch_hex: value.swatchHex,
        is_active: value.isActive,
      })),
    })),
    brands: options.brands.map((brand) => ({
      id: brand.id,
      name: brand.name,
      requires_moderation: brand.requiresModeration,
    })),
  }
}
