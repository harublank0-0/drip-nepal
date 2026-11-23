import { Head } from '@inertiajs/react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { AddressBook } from '~/components/account/address_book'
import type { Place, SavedAddress } from '~/components/account/address_form'

/*
 * `/account/addresses` (docs/08 §2.4, §3.1 "Addresses"; 01 FR-IAM-012),
 * rendered in the browser in the account layout. A `pending_verification`
 * user may use it too (docs/07 §4.4: `/account` self-service).
 *
 * Two props from the controller (app/controllers/account/identity/
 * account_controller.ts): `addresses`, what `listAddresses` answers (the
 * phone's last four digits only, docs/07 §5.5), and `provinces`, what
 * `listProvinces` answers, the first step of the form's cascade
 * (`AddressForm`). The address book does the rest (address_book.tsx).
 */
type Props = InertiaProps<{ addresses: SavedAddress[]; provinces: Place[] }>

export default function AccountAddresses({ addresses, provinces }: Props) {
  return (
    <>
      <Head title={t('account.addresses.title')} />
      <div className="max-w-2xl space-y-6">
        <header className="space-y-2">
          <h1
            tabIndex={-1}
            className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
          >
            {t('account.addresses.heading')}
          </h1>
          <p className="text-muted-foreground">{t('account.addresses.intro')}</p>
        </header>
        <AddressBook addresses={addresses} provinces={provinces} />
      </div>
    </>
  )
}
