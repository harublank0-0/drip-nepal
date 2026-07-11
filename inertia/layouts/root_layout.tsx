import { type Data } from '@generated/data'
import { toast, Toaster } from 'sonner'
import { usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { ThemeProvider } from '~/components/providers/theme_provider'
import { TooltipProvider } from '~/components/ui/tooltip'

export default function RootLayout({
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

  console.info({ pageProps: rest })
  return (
    <>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors />
        </TooltipProvider>
      </ThemeProvider>
    </>
  )
}
