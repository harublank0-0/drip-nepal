import { Share2Icon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '~/components/ui/button'

/*
 * Opens the phone's share sheet (WhatsApp, Messenger, ...) where the
 * browser has one; elsewhere copies the link.
 */
export function ShareButton({ title }: { title: string }) {
  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // Closing the share sheet rejects; nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Link copied')
    } catch {
      toast.error("Couldn't copy the link")
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="size-11 shrink-0 rounded-full"
      aria-label="Share this product"
      onClick={share}
    >
      <Share2Icon className="size-4" aria-hidden="true" />
    </Button>
  )
}
