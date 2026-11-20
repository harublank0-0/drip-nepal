import { useEffect } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'

/*
 * Development fixture (docs/10 §3: component checks run against pages under
 * inertia/pages/dev/, never routed in production). It opens a dialog and
 * shows a toast at once, for two checks of docs/08: a toast stays visible
 * above an open dialog (§5.9), and the dialog does not animate under
 * prefers-reduced-motion (§5.7).
 */
export default function Overlays() {
  // After the root layout's Toaster has subscribed: a toast fired during the
  // first commit, before that, would be dropped.
  useEffect(() => {
    const timer = setTimeout(() => toast('A toast above the dialog'), 100)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fixture dialog</DialogTitle>
          <DialogDescription>
            Overlay layering and motion checks (docs/08 §5.7, §5.9).
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  )
}
