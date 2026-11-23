import { Head } from '@inertiajs/react'
import { CheckIcon, CircleIcon } from 'lucide-react'
import type { InertiaProps } from '~/types'
import { t } from '~/lib/i18n'
import { StatusBadge } from '~/components/common/status_badge'

/*
 * `/seller/{shopSlug}` (docs/08 §2.5 root row; R1-S part 1a), rendered in
 * the browser in the seller layout. The heading is the shop's name with its
 * status badge, from the `current_shop` shared prop; a suspended shop says
 * what its suspension mode still allows (08 §7.5). Then "Before you can
 * sell": the `checklist` prop, the items the server could read from real
 * state for this member (shop_controller.ts), each marked done or not by
 * text, with the icon only reinforcing it (SC 1.4.1). The profile, shipping
 * zones and products join the list with R1-S parts 1b, 1c and 2; the
 * balance and order counts with the milestones that build them.
 */
type ChecklistItem = { item: 'seller_agreement' | 'pickup_address'; done: boolean }

type Props = InertiaProps<{ checklist: ChecklistItem[] }>

const LABEL: Record<ChecklistItem['item'], Parameters<typeof t>[0]> = {
  seller_agreement: 'seller.overview.checklist.seller_agreement',
  pickup_address: 'seller.overview.checklist.pickup_address',
}

export default function SellerOverview({ checklist, current_shop: shop }: Props) {
  if (!shop) return null
  const suspension =
    shop.suspension_mode === 'fulfill_existing'
      ? t('seller.overview.suspension.fulfill_existing')
      : shop.suspension_mode === 'frozen'
        ? t('seller.overview.suspension.frozen')
        : null
  return (
    <>
      <Head title={t('seller.overview.page_title', { name: shop.name })} />
      <div className="max-w-3xl space-y-8">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1
              tabIndex={-1}
              className="font-heading text-2xl font-semibold tracking-tight outline-none md:text-3xl"
            >
              {shop.name}
            </h1>
            <span className="sr-only">{t('seller.overview.status')}</span>
            <StatusBadge entity="shop" state={shop.status} />
          </div>
          {suspension && <p className="text-muted-foreground">{suspension}</p>}
        </header>
        <section aria-labelledby="checklist-heading" className="space-y-4">
          <div className="space-y-1">
            <h2
              id="checklist-heading"
              className="font-heading text-xl font-semibold tracking-tight"
            >
              {t('seller.overview.checklist.heading')}
            </h2>
            <p className="text-muted-foreground">{t('seller.overview.checklist.intro')}</p>
          </div>
          <ul className="divide-y rounded-lg border">
            {checklist.map((entry) => (
              <li key={entry.item} className="flex items-center gap-3 px-4 py-3">
                {entry.done ? (
                  <CheckIcon aria-hidden="true" className="text-success size-5 shrink-0" />
                ) : (
                  <CircleIcon
                    aria-hidden="true"
                    className="text-muted-foreground size-5 shrink-0"
                  />
                )}
                <span className="flex-1">{t(LABEL[entry.item])}</span>
                <span className={entry.done ? 'font-medium' : 'text-muted-foreground'}>
                  {entry.done
                    ? t('seller.overview.checklist.done')
                    : t('seller.overview.checklist.to_do')}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
