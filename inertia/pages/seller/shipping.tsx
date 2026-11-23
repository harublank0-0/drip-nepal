import { Head } from '@inertiajs/react'
import { formatNPR } from '@shared/format/money'
import { profileEditable } from '@shared/ui/shop_access'
import {
  coversEveryDistrict,
  offeredDistricts,
  type DeliveryAreas,
  type ShopShipping,
} from '@shared/ui/shop_shipping'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { ShopShippingForm } from '~/components/seller/shop_shipping_form'
import { PickupAddresses } from '~/components/seller/pickup_addresses'
import type { PickupAddress } from '~/components/seller/pickup_address_form'
import type { Place } from '~/components/forms/location_cascade'

/*
 * `/seller/{shopSlug}/shipping` (docs/08 §2.5 `/shipping` row; R1-S part
 * 1c), rendered in the browser in the seller layout. Props from the
 * controller (app/controllers/seller/shops/shop_controller.ts):
 * `shipping`, what `getShopShipping` answers; `delivery_areas`, the zones
 * and the districts by province (public reference data); and, for members
 * with `shop.shipping.manage` while the shop is `active`, `pickup_addresses`
 * and `provinces` (what `listProvinces` answers, the pickup form's first
 * step: an address cascade, not the delivery areas).
 *
 * - Delivery areas and rates: whether shipping is set up (the overview's
 *   "Shipping zones and rates set" item and the publish gate's condition),
 *   then the form (`ShopShippingForm`) for a role with
 *   `shop.shipping.manage` in a shop whose status lets it change them
 *   (`profileEditable`, the server's "profile, shipping" gate: the owner
 *   alone while `pending_review` or `rejected`, OD-47), else the saved
 *   coverage and rates read-only, with a line saying why.
 * - Pickup addresses (`PickupAddresses`), when the props are there. The rest
 *   of the Courier section waits for R1-S part 6.
 * The UI hides; the server decides (docs/08 §11.6).
 */
type Props = InertiaProps<{
  shipping: ShopShipping
  delivery_areas: DeliveryAreas
  pickup_addresses?: PickupAddress[]
  provinces?: Place[]
}>

export default function SellerShipping({
  shipping,
  delivery_areas: areas,
  pickup_addresses: pickups,
  provinces,
  current_shop: current,
}: Props) {
  if (!current) return null
  const permitted = can(current, 'shop.shipping.manage')
  const editable = permitted && profileEditable(current.status, current.role)
  let reason: string | null = null
  if (!permitted) reason = t('seller.shipping.read_only_role')
  else if (!editable) reason = t('seller.shipping.read_only_status')
  return (
    <>
      <Head title={t('seller.shipping.page_title', { name: current.name })} />
      <div className="max-w-3xl space-y-10">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('seller.shipping.heading')}
          </h1>
          <p className="text-muted-foreground">{t('seller.shipping.intro')}</p>
        </header>
        <section aria-labelledby="shipping-delivery-heading" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="shipping-delivery-heading"
              className="font-heading text-xl font-semibold tracking-tight"
            >
              {t('seller.shipping.delivery_heading')}
            </h2>
            <p className={shipping.configured ? 'font-medium' : 'text-muted-foreground'}>
              {shipping.configured
                ? t('seller.shipping.configured')
                : t('seller.shipping.not_configured')}
            </p>
          </div>
          {reason && (
            <Alert role="status">
              <AlertDescription>{reason}</AlertDescription>
            </Alert>
          )}
          {editable ? (
            <ShopShippingForm shipping={shipping} areas={areas} slug={current.slug} />
          ) : (
            <ShippingSummary shipping={shipping} areas={areas} />
          )}
        </section>
        {pickups && provinces && (
          <section aria-labelledby="shipping-pickup-heading" className="space-y-4">
            <div className="space-y-1">
              <h2
                id="shipping-pickup-heading"
                className="font-heading text-xl font-semibold tracking-tight"
              >
                {t('seller.shipping.pickup.heading')}
              </h2>
              <p className="text-muted-foreground">{t('seller.shipping.pickup.intro')}</p>
            </div>
            <PickupAddresses addresses={pickups} provinces={provinces} slug={current.slug} />
          </section>
        )}
      </div>
    </>
  )
}

// Between district names in the read-only list (English, the UI's language, docs/08 §11.8).
const LIST_SEPARATOR = ', '

// The saved coverage and rates, for a member who may not change them; fees through `formatNPR`.
function ShippingSummary({ shipping, areas }: { shipping: ShopShipping; areas: DeliveryAreas }) {
  const covered = new Set(shipping.coverage)
  const all = coversEveryDistrict(shipping, areas)
  const provinces = areas.provinces
    .map((province) => ({
      name: province.name,
      districts: province.districts.filter((district) => covered.has(district.code)),
    }))
    .filter((province) => province.districts.length > 0)
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="font-heading text-lg font-semibold">
          {t('seller.shipping.coverage_legend')}
        </h3>
        {all && (
          <p>
            {t('seller.shipping.all_districts_note', { count: offeredDistricts(areas).length })}
          </p>
        )}
        {!all && provinces.length === 0 && (
          <p className="text-muted-foreground">{t('seller.shipping.no_coverage')}</p>
        )}
        {!all && provinces.length > 0 && (
          <dl className="divide-y rounded-lg border">
            {provinces.map((province) => (
              <div key={province.name} className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium">{province.name}</dt>
                <dd className="break-words sm:col-span-2">
                  {province.districts.map((district) => district.name).join(LIST_SEPARATOR)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="font-heading text-lg font-semibold">{t('seller.shipping.rates_legend')}</h3>
        <dl className="divide-y rounded-lg border">
          {areas.zones.map((zone) => {
            const rate = shipping.rates.find((saved) => saved.zone_code === zone.code)
            return (
              <div key={zone.code} className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium">{zone.name}</dt>
                <dd className="sm:col-span-2">
                  {rate
                    ? t('seller.shipping.rate_summary', {
                        fee: formatNPR(rate.fee.amount_minor),
                        min: rate.est_min_days,
                        max: rate.est_max_days,
                      })
                    : t('seller.shipping.no_rate')}
                </dd>
              </div>
            )
          })}
        </dl>
      </div>
    </div>
  )
}
