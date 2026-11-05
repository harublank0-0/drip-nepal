import { type Data } from '@generated/data'
import { toast, Toaster } from 'sonner'
import { Head, usePage } from '@inertiajs/react'
import { type ReactElement, useEffect } from 'react'
import { ThemeProvider, useTheme } from '~/components/providers/theme_provider'
import { TooltipProvider } from '~/components/ui/tooltip'
import { SocialMeta } from '~/components/seo/social_meta'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster theme={theme} position="top-center" richColors />
}

export default function RootLayout({ children }: { children: ReactElement<Data.SharedProps> }) {
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

  return (
    <>
      {/* Default title; a page's own <Head title> overrides it. */}
      <Head title="" />
      <SocialMeta />
      <ThemeProvider initialTheme={children.props.theme}>
        <TooltipProvider>
          {children}
          <ThemedToaster />
        </TooltipProvider>
      </ThemeProvider>
    </>
  )
}
