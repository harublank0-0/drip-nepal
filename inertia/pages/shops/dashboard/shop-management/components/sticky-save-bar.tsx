import { AnimatePresence, motion } from 'framer-motion'
import { EyeIcon, RotateCcwIcon, SaveIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { Show } from '~/components/ui/show'

type StickySaveBarProps = {
  visible: boolean
  isSaving: boolean
  onDiscard: () => void
  onSave: () => void
  onSaveAndPreview: () => void
}

export function StickySaveBar({
  visible,
  isSaving,
  onDiscard,
  onSave,
  onSaveAndPreview,
}: StickySaveBarProps) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
          className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4"
          role="region"
          aria-label="Unsaved changes"
        >
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border bg-popover/95 p-3 pl-4 text-popover-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur">
            <p className="text-sm font-medium">You have unsaved changes</p>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onDiscard}
                disabled={isSaving}
                className="hidden sm:inline-flex"
              >
                <RotateCcwIcon data-icon="inline-start" />
                Discard
              </Button>
              <Button variant="outline" size="sm" onClick={onSaveAndPreview} disabled={isSaving}>
                <EyeIcon data-icon="inline-start" />
                Save &amp; Preview
              </Button>
              <Button size="sm" onClick={onSave} disabled={isSaving}>
                <Show when={isSaving}>
                  <Spinner data-icon="inline-start" />
                </Show>
                <Show when={!isSaving}>
                  <SaveIcon data-icon="inline-start" />
                </Show>
                Save Changes
              </Button>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
