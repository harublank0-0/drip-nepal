import { type Data } from '@generated/data'
import { Footer } from '~/components/footer'
import { NavBar } from '~/components/navbar'

export default function CustomersLayout({
  children,
}: {
  children: React.ReactElement<Data.SharedProps>
}) {
  return (
    <>
      <NavBar />
      <main id="main-content" className="pt-17 md:pt-18">
        {children}
      </main>
      <Footer />
    </>
  )
}
