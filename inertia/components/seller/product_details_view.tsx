import {
  offeredValues,
  productAttributesFor,
  type AttributeOption,
  type CategoryOption,
  type SellerProduct,
} from '@shared/ui/product_details'
import { t } from '~/lib/i18n'

/*
 * A product's details as saved, for a member who may not change them now
 * (docs/08 §2.5 `/products/{productId}`; R1-S part 2f-i): a role without
 * `shop.products.edit`, a shop that may not change its catalogue, or a
 * product under review, archived or blocked. The same fields as
 * `ProductDetailsForm`, with the category's label and each attribute's
 * value labels from the form's choices.
 */
export function ProductDetailsView({
  product,
  categories,
  attributes,
}: {
  product: SellerProduct
  categories: CategoryOption[]
  attributes: AttributeOption[]
}) {
  const none = t('seller.product.none')
  const category = categories.find((candidate) => candidate.id === product.category.id)
  const saved = new Map(product.attributes.map((item) => [item.attribute_code, item.value_codes]))
  const attributeRows = productAttributesFor(category, attributes).map(({ attribute }) => {
    const codes = saved.get(attribute.code) ?? []
    const labels = offeredValues(attribute, codes)
      .filter((value) => codes.includes(value.code))
      .map((value) => value.label)
    return [
      `attribute-${attribute.code}`,
      attribute.name,
      labels.length > 0 ? labels.join(', ') : none,
    ] as const
  })
  let origin = t('seller.product.origin_domestic')
  if (product.is_imported) {
    origin = product.country_of_origin
      ? t('seller.product.imported_from', {
          country:
            new Intl.DisplayNames(['en'], { type: 'region' }).of(product.country_of_origin) ??
            product.country_of_origin,
        })
      : t('seller.product.origin_imported')
  }
  // Each row's key, label and value; an attribute's key is its code, so no label can collide.
  const rows: (readonly [key: string, label: string, value: string])[] = [
    ['title', t('seller.product.title'), product.title],
    ['category', t('seller.product.category'), category?.label ?? product.category.path],
    ['brand', t('seller.product.brand'), product.brand?.name ?? t('seller.product.own_label')],
    ...attributeRows,
    ['description', t('seller.product.description'), product.description ?? none],
    ['manufacturer', t('seller.product.manufacturer_name'), product.manufacturer_name ?? none],
    ['origin', t('seller.product.origin'), origin],
    ['warranty', t('seller.product.warranty_text'), product.warranty_text ?? none],
    ['care', t('seller.product.care_and_precautions'), product.care_and_precautions ?? none],
  ]
  return (
    <dl className="divide-y rounded-lg border">
      {rows.map(([key, label, value]) => (
        <div key={key} className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
          <dt className="text-sm font-medium">{label}</dt>
          <dd className="break-words whitespace-pre-line sm:col-span-2">{value}</dd>
        </div>
      ))}
    </dl>
  )
}
