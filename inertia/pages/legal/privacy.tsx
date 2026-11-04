import { LegalPage, LegalSection } from '~/components/legal/legal_page'
import CustomersLayout from '~/layouts/customers_layout'
import RootLayout from '~/layouts/root_layout'

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="4 November 2026"
      current="legal.privacy"
      intro={
        <p>
          We collect only what we need to take and deliver your orders. We don&apos;t sell your
          details, and we don&apos;t use advertising or analytics trackers.
        </p>
      }
    >
      <LegalSection title="What we collect">
        <ul>
          <li>Your name, email address, phone number and password, when you create an account.</li>
          <li>The delivery addresses you enter at checkout.</li>
          <li>Your orders, your cart and any notes you add to an order.</li>
        </ul>
        <p>Your password is stored scrambled (hashed). Nobody, including us, can read it.</p>
      </LegalSection>

      <LegalSection title="How we use it">
        <ul>
          <li>To deliver your orders and call you about them.</li>
          <li>To show your order history and keep you logged in.</li>
          <li>To stop fraud and abuse, such as fake orders or repeated failed logins.</li>
        </ul>
      </LegalSection>

      <LegalSection title="Who we share it with">
        <ul>
          <li>
            The shop that sells you an item sees your name, phone number, delivery address and
            order, so it can deliver.
          </li>
          <li>Delivery partners get what they need to bring the parcel to you.</li>
          <li>Our hosting provider stores the data on our behalf.</li>
        </ul>
        <p>We share nothing else unless the law requires it.</p>
      </LegalSection>

      <LegalSection title="Cookies">
        <p>
          We use cookies only to keep you logged in (and remember you, if you tick &quot;Remember
          me&quot;) and to protect forms from forgery. Your light or dark theme choice is saved in
          your browser. There are no advertising or tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="How long we keep it">
        <p>
          We keep your account while you use it, and order records for as long as accounting and tax
          rules require.
        </p>
      </LegalSection>

      <LegalSection title="Your choices">
        <p>
          You can ask us for a copy of your details, ask us to correct them, or ask us to delete
          your account. Order records we must keep by law stay until that period ends.
        </p>
      </LegalSection>
    </LegalPage>
  )
}

Privacy.layout = [RootLayout, CustomersLayout]
