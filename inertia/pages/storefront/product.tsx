/* eslint-disable react/no-unknown-property -- Inertia's <Head> replaces tags by their head-key */
import type { ReactNode } from 'react'
import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ChevronRightIcon } from 'lucide-react'
import { discountPercent, formatNPR } from '@shared/format/money'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { PageSeo } from '~/components/seo/page_seo'
import { SocialMeta } from '~/components/seo/social_meta'
import { PriceTag } from '~/components/catalog/price_tag'
import { ProductGallery, type GalleryImage } from '~/components/catalog/product_gallery'

/*
 * The storefront product page `/p/{slug}-{publicId}` (docs/08 §2.2, §3.1,
 * §11.2; 01 FR-CAT-012, FR-SRCH-004, FR-SRCH-005; 02 J-02, AC-J02-02, -03
 * and -07; R1-S part 3d-ii-a). Server-rendered with everything a search
 * engine or a slow phone needs: the breadcrumb of the category path, the
 * images, the brand, title and shop, the price (one amount or the range of
 * the variants, the compare-at price and the saving when every variant has
 * the same), whether anything is in stock, the options offered, the
 * delivery fee and estimate per zone, cash on delivery, the shop's return
 * policy, the description and the FR-CAT-012 details. The controller gives
 * the canonical URL and the JSON-LD `Product`.
 *
 * The variant picker of 08 §11.2 and `?variant=` come with part 3d-ii-b,
 * "Add to cart" with the cart (part 4).
 */
type Money = { amount_minor: number; currency: string }

type Product = {
  public_id: string
  slug: string
  title: string
  description: string
  categories: { slug: string; name: string }[]
  brand: { slug: string; name: string } | null
  shop: { slug: string; name: string; return_policy: string }
  attributes: { code: string; name: string; values: { code: string; label: string }[] }[]
  disclosures: {
    manufacturer_name: string
    is_imported: boolean
    country_of_origin: string | null
    warranty_text: string
    care_and_precautions: string
  }
  option_axes: {
    code: string
    name: string
    values: { code: string; label: string; swatch_hex: string | null }[]
  }[]
  variants: {
    id: string
    option_values: Record<string, string>
    price: Money
    compare_at: Money | null
    weight_grams: number | null
    in_stock: boolean
    available_capped: number
  }[]
  media: GalleryImage[]
  delivery: {
    zone_code: string
    zone_name: string
    fee: Money
    est_min_days: number
    est_max_days: number
  }[]
  published_at: string
}

type Props = InertiaProps<{
  product: Product
  seo: { canonical: string; json_ld: string }
}>

function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="border-t pt-4">
      <h2 className="mb-2 text-base font-semibold">{heading}</h2>
      {children}
    </section>
  )
}

// The price of every variant, or null when they differ (then the page shows the range only).
function onePrice(product: Product) {
  const [first, ...rest] = product.variants
  const same = rest.every(
    (variant) =>
      variant.price.amount_minor === first.price.amount_minor &&
      (variant.compare_at?.amount_minor ?? null) === (first.compare_at?.amount_minor ?? null)
  )
  return same ? first : null
}

function weightText(product: Product) {
  const grams = product.variants
    .map((variant) => variant.weight_grams)
    .filter((value): value is number => value !== null)
  if (grams.length === 0) return null
  const min = Math.min(...grams)
  const max = Math.max(...grams)
  return min === max
    ? t('storefront.product.weight_grams', { grams: min })
    : t('storefront.product.weight_range', { min, max })
}

export default function ProductPage({ product, seo }: Props) {
  const prices = product.variants.map((variant) => variant.price.amount_minor)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const single = onePrice(product)
  const saving = single
    ? discountPercent(single.price.amount_minor, single.compare_at?.amount_minor ?? null)
    : null
  const soldOut = product.variants.every((variant) => !variant.in_stock)
  const currency = product.variants[0].price.currency
  const weight = weightText(product)
  const details: { label: string; value: string }[] = [
    {
      label: t('storefront.product.brand'),
      value: product.brand?.name ?? t('storefront.product.own_label'),
    },
    ...product.attributes.map((attribute) => ({
      label: attribute.name,
      value: attribute.values.map((value) => value.label).join(', '),
    })),
    ...(weight ? [{ label: t('storefront.product.weight'), value: weight }] : []),
    { label: t('storefront.product.producer'), value: product.disclosures.manufacturer_name },
    ...(product.disclosures.is_imported && product.disclosures.country_of_origin
      ? [{ label: t('storefront.product.origin'), value: product.disclosures.country_of_origin }]
      : []),
    { label: t('storefront.product.warranty'), value: product.disclosures.warranty_text },
    { label: t('storefront.product.care'), value: product.disclosures.care_and_precautions },
  ]

  return (
    <>
      <Head title={product.title}>
        <script
          head-key="json-ld"
          type="application/ld+json"
          // JSON-LD is data, not script; the server escaped it (jsonLdScript), so no text can close the tag.
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: seo.json_ld }}
        />
      </Head>
      <SocialMeta
        title={product.title}
        description={product.description}
        image={product.media[0]?.src || null}
        type="product"
        priceMinor={min}
      />
      <PageSeo canonical={seo.canonical} noindex={false} />
      <div className="mx-auto max-w-7xl py-4">
        <nav aria-label={t('storefront.listing.breadcrumb')} className="mb-4 text-sm">
          <ol className="text-muted-foreground flex flex-wrap items-center gap-1">
            <li>
              <Link href="/" className="hover:underline">
                {t('storefront.listing.home')}
              </Link>
            </li>
            {product.categories.map((category) => (
              <li key={category.slug} className="flex items-center gap-1">
                <ChevronRightIcon aria-hidden="true" className="size-3.5" />
                <Link href={`/c/${category.slug}`} className="hover:underline">
                  {category.name}
                </Link>
              </li>
            ))}
            <li className="flex min-w-0 items-center gap-1">
              <ChevronRightIcon aria-hidden="true" className="size-3.5" />
              <span aria-current="page" className="text-foreground truncate">
                {product.title}
              </span>
            </li>
          </ol>
        </nav>
        <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
          <ProductGallery media={product.media} />
          <div className="flex min-w-0 flex-col gap-4">
            <div>
              {product.brand ? (
                <p className="text-muted-foreground text-sm">{product.brand.name}</p>
              ) : null}
              <h1
                tabIndex={-1}
                className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
              >
                {product.title}
              </h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {t('storefront.product.sold_by', { shop: product.shop.name })}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline gap-x-3 text-xl">
                <PriceTag
                  min={{ amount_minor: min, currency }}
                  max={{ amount_minor: max, currency }}
                  compareAt={single?.compare_at ?? null}
                />
                {saving === null ? null : (
                  <span className="text-primary text-sm font-medium">
                    {t('storefront.product.discount', { percent: saving })}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {t('storefront.product.tax_included')}
              </p>
              {soldOut ? (
                <p className="text-sm font-medium">{t('storefront.product.sold_out')}</p>
              ) : null}
            </div>
            {product.option_axes.length > 0 ? (
              <dl className="flex flex-col gap-2 text-sm">
                {product.option_axes.map((axis) => (
                  <div key={axis.code}>
                    <dt className="font-medium">{axis.name}</dt>
                    <dd>
                      <ul className="mt-1 flex flex-wrap gap-2">
                        {axis.values.map((value) => (
                          <li
                            key={value.code}
                            className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1"
                          >
                            {value.swatch_hex ? (
                              <span
                                aria-hidden="true"
                                className="size-3.5 rounded-full border"
                                style={{ backgroundColor: value.swatch_hex }}
                              />
                            ) : null}
                            {value.label}
                          </li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {product.delivery.length > 0 ? (
              <Section heading={t('storefront.product.delivery_heading')}>
                <ul className="flex flex-col gap-1 text-sm">
                  {product.delivery.map((zone) => (
                    <li key={zone.zone_code}>
                      {t('storefront.product.delivery_zone', {
                        zone: zone.zone_name,
                        fee: formatNPR(zone.fee.amount_minor),
                      })}{' '}
                      <span className="text-muted-foreground">
                        {zone.est_min_days === zone.est_max_days
                          ? t('storefront.product.delivery_days_exact', { days: zone.est_max_days })
                          : t('storefront.product.delivery_days', {
                              min: zone.est_min_days,
                              max: zone.est_max_days,
                            })}
                      </span>
                    </li>
                  ))}
                </ul>
              </Section>
            ) : null}
            <Section heading={t('storefront.product.payment_heading')}>
              <p className="text-sm">{t('storefront.product.payment_cod')}</p>
            </Section>
            <Section heading={t('storefront.product.returns_heading')}>
              <p className="text-sm whitespace-pre-line">{product.shop.return_policy}</p>
            </Section>
          </div>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-2">
          <Section heading={t('storefront.product.description_heading')}>
            <p className="text-sm whitespace-pre-line">{product.description}</p>
          </Section>
          <Section heading={t('storefront.product.details_heading')}>
            <dl className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
              {details.map((row) => (
                <div key={row.label} className="contents">
                  <dt className="text-muted-foreground">{row.label}</dt>
                  <dd className="whitespace-pre-line">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </div>
      </div>
    </>
  )
}
