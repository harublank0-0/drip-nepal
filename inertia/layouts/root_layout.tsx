import { type Data } from '@generated/data'
import { toast, Toaster } from 'sonner'
import { Head, usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { ThemeProvider } from '~/components/providers/theme_provider'
import { TooltipProvider } from '~/components/ui/tooltip'
import { SocialMeta } from '~/components/seo/social_meta'

export default function RootLayout({ children }: { children: ReactElement<Data.SharedProps> }) {
  const { url, props } = usePage<Data.SharedProps>()
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

  return (
    <>
      {/* Default title; a page's own <Head title> overrides it. */}
      <Head title="" />
      <SocialMeta />
      <ThemeProvider initialTheme={props.theme}>
        <TooltipProvider>
          {children}
          <Toaster position="top-center" richColors theme={props.theme} />
        </TooltipProvider>
      </ThemeProvider>
    </>
  )
}
