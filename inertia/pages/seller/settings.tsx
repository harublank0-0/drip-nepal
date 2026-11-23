import { Head } from '@inertiajs/react'
import { profileEditable } from '@shared/ui/shop_access'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { can } from '~/lib/permissions'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { ShopSettingsForm, type SellerShop } from '~/components/seller/shop_settings_form'

/*
 * `/seller/{shopSlug}/settings` (docs/08 §2.5 `/settings` row; R1-S part
 * 1b), rendered in the browser in the seller layout. Its one prop, `shop`,
 * is the shop as `getSellerShop` shows it to this member
 * (app/controllers/seller/shops/shop_controller.ts): the owner-only business
 * details and grievance contact are null for anyone but the owner.
 *
 * A member whose role holds `shop.profile.manage`, in a shop whose status
 * lets them edit the profile (`profileEditable`, the server's own gate,
 * docs/07 §4.4), gets the form (`ShopSettingsForm`); anyone else reads the
 * profile, with a line saying why it cannot be changed: a suspended shop,
 * or a role without the permission. The UI hides; the server decides
 * (docs/08 §11.6).
 */
type Props = InertiaProps<{ shop: SellerShop }>

export default function SellerSettings({ shop, current_shop: current }: Props) {
  if (!current) return null
  const permitted = can(current, 'shop.profile.manage')
  const editable = permitted && profileEditable(current.status, current.role)
  let reason: string | null = null
  if (!permitted) reason = t('seller.settings.read_only_role')
  else if (!editable) reason = t('seller.settings.read_only_status')
  return (
    <>
      <Head title={t('seller.settings.page_title', { name: shop.name })} />
      <div className="max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('seller.settings.heading')}
          </h1>
          <p className="text-muted-foreground">{t('seller.settings.intro')}</p>
        </header>
        {reason && (
          <Alert role="status">
            <AlertDescription>{reason}</AlertDescription>
          </Alert>
        )}
        {editable ? <ShopSettingsForm shop={shop} /> : <ShopProfile shop={shop} />}
      </div>
    </>
  )
}

// The profile as saved, for a member who may not change it.
function ShopProfile({ shop }: { shop: SellerShop }) {
  const details = shop.business_details
  const grievance = shop.grievance_contact
  const rows: [label: string, value: string][] = [
    [t('seller.settings.name'), shop.name],
    [t('seller.settings.slug'), shop.slug],
    [t('seller.settings.description'), shop.description ?? t('seller.settings.none')],
    [t('seller.settings.contact_email'), shop.contact_email],
    [t('seller.settings.contact_phone'), shop.contact_phone],
  ]
  if (details) {
    rows.push(
      [
        t('seller.settings.business_type'),
        details.business_type === 'registered_business'
          ? t('seller.settings.business_type_registered')
          : t('seller.settings.business_type_individual'),
      ],
      [
        t('seller.settings.registration_number'),
        details.registration_number ?? t('seller.settings.none'),
      ],
      [
        t('seller.settings.registration_authority'),
        details.registration_authority ?? t('seller.settings.none'),
      ],
      [t('seller.settings.pan_vat_number'), details.pan_vat_number ?? t('seller.settings.none')],
      [
        t('seller.settings.is_vat_registered'),
        details.is_vat_registered ? t('seller.settings.yes') : t('seller.settings.no'),
      ],
      [t('seller.settings.return_policy_text'), details.return_policy_text]
    )
  }
  if (grievance) {
    rows.push(
      [t('seller.settings.grievance_contact_name'), grievance.name],
      [t('seller.settings.grievance_contact_phone'), grievance.phone]
    )
  }
  return (
    <section aria-labelledby="settings-profile-heading" className="space-y-4">
      <h2
        id="settings-profile-heading"
        className="font-heading text-xl font-semibold tracking-tight"
      >
        {t('seller.settings.profile_heading')}
      </h2>
      <dl className="divide-y rounded-lg border">
        {rows.map(([label, value]) => (
          <div key={label} className="grid gap-1 px-4 py-3 sm:grid-cols-3 sm:gap-4">
            <dt className="text-sm font-medium">{label}</dt>
            <dd className="break-words whitespace-pre-line sm:col-span-2">{value}</dd>
          </div>
        ))}
      </dl>
      {!details && <p className="text-muted-foreground">{t('seller.settings.owner_only_note')}</p>}
    </section>
  )
}
