import { Link } from '@adonisjs/inertia/react'
import { LegalPage, LegalSection } from '~/components/legal/legal_page'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'
import { formatPrice } from '~/lib/format'
import { FREE_SHIPPING_THRESHOLD, SHIPPING_FEE_PER_SHOP } from '~/lib/order'

export default function Terms() {
  return (
    <LegalPage
      title="Terms of service"
      updated="4 November 2026"
      current="legal.terms"
      intro={
        <p>
          These terms cover using Drip Nepal and buying from it. By creating an account or placing
          an order, you agree to them.
        </p>
      }
    >
      <LegalSection title="Your account">
        <ul>
          <li>
            You need an account to order. Give your real name and a phone number we can reach.
          </li>
          <li>
            Keep your password to yourself. You are responsible for orders placed from your account.
          </li>
          <li>We may suspend an account that places fake orders or keeps refusing deliveries.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Orders and prices">
        <ul>
          <li>Prices are in Nepali rupees and are the prices shown when you place the order.</li>
          <li>
            Placing an order is a request to buy. The order is accepted when the shop confirms it.
            The shop may call the number you gave to confirm.
          </li>
          <li>
            If an item turns out to be out of stock or priced wrongly, the shop may cancel the
            order. You pay nothing for a cancelled order.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Payment and delivery">
        <ul>
          <li>You pay in cash when the order is delivered.</li>
          <li>
            Delivery costs {formatPrice(SHIPPING_FEE_PER_SHOP)} per shop and is free when your items
            from that shop add up to {formatPrice(FREE_SHIPPING_THRESHOLD)} or more. The fee is
            shown before you place the order.
          </li>
          <li>
            Delivery times depend on where you are. Someone needs to be at the address to receive
            and pay for the parcel.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Cancellations and returns">
        <p>
          You can cancel until the shop confirms your order. Returns and refunds follow our{' '}
          <Link route="legal.returns" className="underline underline-offset-2">
            returns policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="Product photos and descriptions">
        <p>
          We describe and photograph products as accurately as we can. Colours can look slightly
          different on different screens.
        </p>
      </LegalSection>

      <LegalSection title="Changes to these terms">
        <p>
          We may update these terms. The date at the top shows the latest version, and the version
          in place when you ordered applies to that order.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

Terms.layout = [RootLayout, CustomersLayout]
