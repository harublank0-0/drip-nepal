import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangleIcon, ExternalLinkIcon, EyeIcon, SaveIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Spinner } from '~/components/ui/spinner'
import { Typography } from '~/components/ui/typography'
import { Show } from '~/components/ui/show'

type PageHeaderProps = {
  storeSlug: string
  isDirty: boolean
  isSaving: boolean
  onSave: () => void
}

export function PageHeader({ storeSlug, isDirty, isSaving, onSave }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 border-b bg-background/80 px-4 py-6 backdrop-blur-sm sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <Typography.H1 className="text-left text-2xl font-heading font-semibold tracking-tight text-balance sm:text-3xl">
            Shop Management
          </Typography.H1>
          <Typography.Muted className="max-w-2xl text-sm leading-relaxed">
            Manage your storefront, business information, branding, settings, and operational
            status.
          </Typography.Muted>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`/preview/${storeSlug}`} target="_blank" rel="noreferrer">
              <EyeIcon data-icon="inline-start" />
              Preview Store
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`/${storeSlug}`} target="_blank" rel="noreferrer">
              <ExternalLinkIcon data-icon="inline-start" />
              Visit Live Store
            </a>
          </Button>
          <Button size="sm" onClick={onSave} disabled={!isDirty || isSaving}>
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

      <AnimatePresence>
        <Show when={isDirty} key="unsaved-badge">
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex w-fit items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-400">
              <AlertTriangleIcon className="size-3.5" />
              You have unsaved changes.
            </div>
          </motion.div>
        </Show>
      </AnimatePresence>
    </div>
  )
}
