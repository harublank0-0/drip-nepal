import { type Data } from '@generated/data'
import { toast } from 'sonner'
import { Head, usePage } from '@inertiajs/react'
import { type ReactNode, useEffect } from 'react'
import { ThemeProvider, useTheme } from '~/components/providers/theme_provider'
import { Toaster } from '~/components/ui/sonner'
import { TooltipProvider } from '~/components/ui/tooltip'
import { SocialMeta } from '~/components/seo/social_meta'
import { LiveRegions } from '~/components/common/live_regions'

// Every page's outer layout; a surface layout, if any, sits inside it (layout_for.ts).
export default function RootLayout({ children }: { children: ReactNode }) {
  const { url, props } = usePage<Data.SharedProps>()
  useEffect(() => {
    toast.dismiss()
  }, [url])

  useEffect(() => {
    if (props.flash.error) {
      toast.error(props.flash.error)
    }
    if (props.flash.success) {
      toast.success(props.flash.success)
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
          <LiveRegions />
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
