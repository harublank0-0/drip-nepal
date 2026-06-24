import { type Data } from '@generated/data'
import { toast, Toaster } from 'sonner'
import { usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { NavBar } from '~/components/navbar'
import { Footer } from '~/components/footer'
import { ThemeProvider } from '~/components/providers/theme_provider'

export default function Layout({
  children,
  ...rest
}: {
  children: ReactElement<Data.SharedProps>
}) {
  const { url } = usePage()
  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (children.props.flash.error) {
      toast.error(children.props.flash.error)
    }
    if (children.props.flash.success) {
      toast.success(children.props.flash.success)
    }
  })

  console.log({ rest })

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:outline-none"
      >
        Skip to content
      </a>
      <ThemeProvider defaultTheme="dark">
        <NavBar />
        <main id="main-content">{children}</main>
        <Footer />
        <Toaster position="top-center" richColors />
      </ThemeProvider>
    </>
  )
}
