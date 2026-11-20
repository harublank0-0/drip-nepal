import { type Data } from '@generated/data'
import { toast } from 'sonner'
import { Head, usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { ThemeProvider, useTheme } from '~/components/providers/theme_provider'
import { Toaster } from '~/components/ui/sonner'
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
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
    </>
  )
}

// The one Toaster (docs/08 §4.1, §7.4), from the ui/sonner wrapper. It follows the
// provider's theme, so a change shows at once, not on the next visit.
function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="top-center" richColors theme={theme} />
}
