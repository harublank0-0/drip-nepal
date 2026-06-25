import { Toaster } from 'sonner'
import { CartDrawer } from '~/components/commerce/cart/cart_drawer'
import { Footer } from '~/components/footer'
import { NavBar } from '~/components/navbar'
import { ThemeProvider } from '~/components/providers/theme_provider'
import { CartProvider } from '~/hooks/use_cart'

export function CustomerLayout(page: React.ReactNode) {
  return (
    <>
      <CartProvider>
        <NavBar />
        <ThemeProvider defaultTheme="dark">
          <main id="main-content" className="pt-18">
            {page}
          </main>
          <Toaster position="top-center" richColors />
        </ThemeProvider>
        <Footer />
        <CartDrawer />
      </CartProvider>
    </>
  )
}
