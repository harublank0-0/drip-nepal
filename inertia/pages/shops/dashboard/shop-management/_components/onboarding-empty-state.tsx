import { motion } from 'framer-motion'
import { ArrowRightIcon, StoreIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '~/components/ui/empty'

export function OnboardingEmptyState({ onComplete }: { onComplete: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto max-w-xl px-4 py-12"
    >
      <Empty className="rounded-2xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-14 rounded-2xl">
            <StoreIcon className="size-6" />
          </EmptyMedia>
          <EmptyTitle className="text-lg">Let&apos;s make your shop ready for customers</EmptyTitle>
          <EmptyDescription>
            Add your business details, branding, and store policies to unlock the full shop
            management dashboard.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onComplete}>
            Complete Setup
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
        </EmptyContent>
      </Empty>
    </motion.div>
  )
}
