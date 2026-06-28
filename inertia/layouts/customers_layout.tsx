import { Data } from '@generated/data'
import { Toaster } from 'sonner'
import { CartDrawer } from '~/components/commerce/cart/cart_drawer'
import { Footer } from '~/components/footer'
import { NavBar } from '~/components/navbar'
import { CartProvider } from '~/hooks/use_cart'

export default function CustomersLayout({
  children,
}: {
  children: React.ReactElement<Data.SharedProps>
}) {
  return (
    <>
      <CartProvider>
        <NavBar />
        <main id="main-content" className="pt-18">
          {children}
        </main>
        <Toaster position="top-center" richColors />
        <Footer />
        <CartDrawer />
      </CartProvider>
    </>
  )
}
