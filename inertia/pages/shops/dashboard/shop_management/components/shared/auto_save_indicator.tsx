import { AnimatePresence, motion } from 'framer-motion'
import { CheckIcon, CloudIcon, AlertCircleIcon } from 'lucide-react'
import { Spinner } from '~/components/ui/spinner'
import { cn } from '~/lib/utils'

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function AutoSaveIndicator({
  status,
  className,
}: {
  status: AutoSaveStatus
  className?: string
}) {
  return (
    <div className={cn('flex h-5 items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <AnimatePresence mode="wait" initial={false}>
        {status === 'saving' && (
          <motion.span
            key="saving"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-1.5"
          >
            <Spinner className="size-3" />
            Saving…
          </motion.span>
        )}
        {status === 'saved' && (
          <motion.span
            key="saved"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
          >
            <CheckIcon className="size-3" />
            Saved
          </motion.span>
        )}
        {status === 'error' && (
          <motion.span
            key="error"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-1.5 text-destructive"
          >
            <AlertCircleIcon className="size-3" />
            Couldn&apos;t save
          </motion.span>
        )}
        {status === 'idle' && (
          <motion.span
            key="idle"
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="flex items-center gap-1.5"
          >
            <CloudIcon className="size-3" />
            Auto-save on
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  )
}
