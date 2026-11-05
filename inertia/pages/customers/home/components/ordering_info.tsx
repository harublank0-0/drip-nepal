import { Link } from '@adonisjs/inertia/react'
import { BanknoteIcon, RotateCcwIcon, TruckIcon } from 'lucide-react'
import { formatNPR } from '@shared/format/money'
import {
  FREE_SHIPPING_THRESHOLD_MINOR,
  SHIPPING_FEE_PER_SHOP_MINOR,
} from '@shared/constants/delivery'
import { RETURN_DAYS } from '~/lib/policies'

/*
 * What a first-time shopper wants to know before ordering: how they pay,
 * what delivery costs, and whether they can send it back.
 */
export function OrderingInfo() {
  const items = [
    {
      icon: BanknoteIcon,
      title: 'Cash on delivery',
      text: 'Pay when it arrives',
    },
    {
      icon: TruckIcon,
      title: `Delivery ${formatNPR(SHIPPING_FEE_PER_SHOP_MINOR)}`,
      text: `Free over ${formatNPR(FREE_SHIPPING_THRESHOLD_MINOR)}`,
    },
    {
      icon: RotateCcwIcon,
      title: `${RETURN_DAYS}-day returns`,
      text: 'On unworn items',
      href: true,
    },
  ]

  return (
    <section aria-label="How ordering works" className="border-b border-border/50 bg-card/60">
      <ul className="mx-auto grid max-w-7xl grid-cols-3 divide-x divide-border/50 md:px-8">
        {items.map((item) => {
          const content = (
            <>
              <item.icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
              <span className="flex flex-col">
                <span className="text-xs font-semibold md:text-sm">{item.title}</span>
                <span className="text-[11px] text-muted-foreground md:text-xs">{item.text}</span>
              </span>
            </>
          )
          const className =
            'flex h-full flex-col items-center gap-1.5 px-2 py-4 text-center md:flex-row md:justify-center md:gap-3 md:text-left'
          return (
            <li key={item.title}>
              {item.href ? (
                <Link route="legal.returns" className={`${className} hover:bg-muted/40`}>
                  {content}
                </Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
