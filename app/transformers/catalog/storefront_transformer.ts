import {
  AVAILABLE_CAP,
  type CategoryTreeNode,
  type FilterAttribute,
  type ListingCardRow,
  type StorefrontProduct,
} from '#modules/catalog/queries'
import { minorToRupeesFixed } from '#shared/format/money'
import { imageSources } from '#shared/ui/image_sources'

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

// A choice of the listing's brand filter (docs/08 §11.1).
export function brandOptionJson(brand: { slug: string; name: string }) {
  return { slug: brand.slug, name: brand.name }
}

// A category of the listing's category filter on `/search` (docs/08 §11.1).
export type FilterCategoryJson = { slug: string; name: string; children: FilterCategoryJson[] }

export function filterCategoryJson(node: CategoryTreeNode): FilterCategoryJson {
  return { slug: node.slug, name: node.name, children: node.children.map(filterCategoryJson) }
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

/*
 * The storefront product (docs/06 §13.2 `getProduct`; openapi
 * `StorefrontProduct`; R1-S part 3c). Each variant gives `in_stock` and
 * `available_capped`, its available quantity capped at `AVAILABLE_CAP`, so
 * exact stock above that is not published (08 §11.2). Prices are integer
 * paisa (ADR-0007).
 */
export function storefrontProductJson(product: StorefrontProduct) {
  return {
    public_id: product.publicId,
    slug: product.slug,
    title: product.title,
    description: product.description,
    categories: product.categories,
    brand: product.brand,
    shop: {
      slug: product.shop.slug,
      name: product.shop.name,
      return_policy: product.shop.returnPolicy,
    },
    attributes: product.attributes,
    disclosures: {
      manufacturer_name: product.disclosures.manufacturerName,
      is_imported: product.disclosures.isImported,
      country_of_origin: product.disclosures.countryOfOrigin,
      warranty_text: product.disclosures.warrantyText,
      care_and_precautions: product.disclosures.careAndPrecautions,
    },
    option_axes: product.optionAxes.map((axis) => ({
      code: axis.code,
      name: axis.name,
      values: axis.values.map((value) => ({
        code: value.code,
        label: value.label,
        swatch_hex: value.swatchHex,
      })),
    })),
    variants: product.variants.map((variant) => ({
      id: variant.id,
      option_values: variant.optionValues,
      price: money(variant.priceMinor, product.currency),
      compare_at:
        variant.compareAtPriceMinor === null
          ? null
          : money(variant.compareAtPriceMinor, product.currency),
      weight_grams: variant.weightGrams,
      in_stock: variant.available > 0,
      available_capped: Math.min(variant.available, AVAILABLE_CAP),
    })),
    media: product.media.map((item) => ({
      alt: item.alt,
      srcset_keys: item.keys,
      color: item.colorCode,
    })),
    delivery: product.delivery.map((zone) => ({
      zone_code: zone.zoneCode,
      zone_name: zone.zoneName,
      fee: money(zone.feeMinor, zone.currency),
      est_min_days: zone.estMinDays,
      est_max_days: zone.estMaxDays,
    })),
    published_at: product.publishedAt.toISOString(),
  }
}

// The image URLs of a storefront page; shared with the seller editor (shared/ui/image_sources.ts).
export { imageSources }

// The storefront product page's path: the current slug and the lowercase public ID (ADR-0017).
export const productHref = (slug: string, publicId: string) =>
  `/p/${slug}-${publicId.toLowerCase()}`

/*
 * A listing page's card (docs/08 §2.2 `storefront/listing`; R1-S part 3d-i):
 * the `ListingCard` of `listProducts` with the product's page path and the
 * image as URLs.
 */
export function listingPageCardJson(row: ListingCardRow, mediaBase: string) {
  const card = listingCardJson(row)
  return {
    ...card,
    href: productHref(row.slug, row.public_id),
    image: { alt: card.image.alt, ...imageSources(row.primary_image_keys, mediaBase) },
  }
}

/*
 * The product page's props (docs/08 §2.2, §11.2; R1-S part 3d-ii): the
 * product as `getProduct` answers it, with each image as `<img>` takes it,
 * from the public bucket's base URL.
 */
export function storefrontProductPageJson(product: StorefrontProduct, mediaBase: string) {
  const { media, ...json } = storefrontProductJson(product)
  return {
    ...json,
    media: media.map((item) => ({
      alt: item.alt,
      color: item.color,
      ...imageSources(item.srcset_keys, mediaBase),
    })),
  }
}

const SCHEMA_STOCK = {
  in: 'https://schema.org/InStock',
  out: 'https://schema.org/OutOfStock',
}

/*
 * The product's JSON-LD `Product` (01 AC-FR-SRCH-005-4, 02 AC-J02-07;
 * ADR-0017 decision 8), on its canonical URL only. A product without
 * option axes offers its default variant: its price in NPR and whether it
 * is in stock at render time. A product with axes has no default variant
 * (01 glossary), so it offers an `AggregateOffer`: its lowest and highest
 * variant prices, the number of variants, and in stock when any is.
 * Prices are decimal strings built from paisa, never floats.
 */
export function productJsonLd(
  product: StorefrontProduct,
  canonicalUrl: string,
  images: string[]
): Record<string, unknown> {
  const prices = product.variants.map((variant) => variant.priceMinor)
  const inStock = product.variants.some((variant) => variant.available > 0)
  const offers =
    product.optionAxes.length === 0 && product.variants.length === 1
      ? {
          '@type': 'Offer',
          'price': minorToRupeesFixed(prices[0]),
          'priceCurrency': product.currency,
          'availability': inStock ? SCHEMA_STOCK.in : SCHEMA_STOCK.out,
          'itemCondition': 'https://schema.org/NewCondition',
          'url': canonicalUrl,
        }
      : {
          '@type': 'AggregateOffer',
          'lowPrice': minorToRupeesFixed(Math.min(...prices)),
          'highPrice': minorToRupeesFixed(Math.max(...prices)),
          'offerCount': product.variants.length,
          'priceCurrency': product.currency,
          'availability': inStock ? SCHEMA_STOCK.in : SCHEMA_STOCK.out,
        }
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    'name': product.title,
    'description': product.description,
    'url': canonicalUrl,
    ...(images.length > 0 ? { image: images } : {}),
    ...(product.brand ? { brand: { '@type': 'Brand', 'name': product.brand.name } } : {}),
    offers,
  }
}

/*
 * JSON for a `<script type="application/ld+json">`: `<`, `>`, `&` and the
 * line separators escaped, so no text of the product can close the script.
 */
export function jsonLdScript(value: Record<string, unknown>) {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll('\u2028', '\\u2028')
    .replaceAll('\u2029', '\\u2029')
}
