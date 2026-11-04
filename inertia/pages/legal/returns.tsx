import { Link } from '@adonisjs/inertia/react'
import { LegalPage, LegalSection } from '~/components/legal/legal_page'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'
import { DAMAGE_REPORT_HOURS, REFUND_DAYS, RETURN_DAYS } from '~/lib/policies'

export default function ReturnsPolicy() {
  return (
    <LegalPage
      title="Returns and refunds"
      updated="4 November 2026"
      current="legal.returns"
      intro={
        <p>
          If something doesn&apos;t fit or isn&apos;t what you expected, you can return it within{' '}
          {RETURN_DAYS} days of delivery. Here is how it works.
        </p>
      }
    >
      <LegalSection title="What you can return">
        <ul>
          <li>Items returned within {RETURN_DAYS} days of the day they were delivered.</li>
          <li>Unworn and unwashed, with the original tags and packaging.</li>
          <li>In the same condition you received them.</li>
        </ul>
        <p>We can&apos;t take back:</p>
        <ul>
          <li>Innerwear, socks and face masks, for hygiene reasons.</li>
          <li>Items that have been worn, washed, altered or damaged after delivery.</li>
          <li>Items the product page marks as final sale.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Wrong, damaged or faulty items">
        <p>
          Check your parcel when it arrives. If an item is damaged, faulty or not what you ordered,
          tell us within {DAMAGE_REPORT_HOURS} hours of delivery with your order number and a photo.
          We will replace it or refund you in full, and we pay for the return delivery.
        </p>
      </LegalSection>

      <LegalSection title="Exchanges for a different size">
        <p>
          Want another size? Ask for an exchange instead of a refund. We send the new size once the
          return reaches us, if it is in stock. If it isn&apos;t, we refund you.
        </p>
      </LegalSection>

      <LegalSection title="How to return an item">
        <ul>
          <li>Contact us with your order number and the items you are returning.</li>
          <li>We confirm the return and tell you where to send it or when we will collect it.</li>
          <li>
            Pack the items with their tags. Unless the item was wrong or damaged, you pay the return
            delivery.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Refunds">
        <p>
          You paid in cash on delivery, so we refund by bank transfer, eSewa or Khalti, whichever
          you prefer. We send the refund within {REFUND_DAYS} days of receiving and checking the
          return. The delivery fee is refunded only when the item was wrong or damaged.
        </p>
      </LegalSection>

      <LegalSection title="Cancelling an order">
        <p>
          You can cancel an order yourself from{' '}
          <Link route="account.orders.index" className="underline underline-offset-2">
            My orders
          </Link>{' '}
          until the shop confirms it. After that, contact us and we will do our best to stop it
          before it ships.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

ReturnsPolicy.layout = [RootLayout, CustomersLayout]
