import { motion } from 'framer-motion'
import { CheckCircleIcon, ArrowRightIcon, PlusIcon, LayoutDashboardIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'

const nextSteps = [
  'Upload PAN number',
  'Add bank details',
  'Verify your business',
  'Add your first product',
]

type SuccessScreenProps = {
  onGoToDashboard: () => void
  onAddFirstProduct: () => void
}

export function SuccessScreen({ onGoToDashboard, onAddFirstProduct }: SuccessScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      {/* animated checkmark */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.1 }}
        className="flex size-20 items-center justify-center rounded-full bg-emerald-500/10"
      >
        <motion.svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-500"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <motion.path
            d="M20 6L9 17L4 12"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          />
        </motion.svg>
      </motion.div>

      <motion.h2
        className="mt-6 text-2xl font-heading font-bold tracking-tight"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4, duration: 0.4 }}
      >
        Your shop is ready!
      </motion.h2>

      <motion.p
        className="mt-2 text-sm text-muted-foreground"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        Welcome to the Drip Nepal seller community. Here&apos;s what to do next.
      </motion.p>

      {/* next steps */}
      <motion.div
        className="mt-8 w-full max-w-sm space-y-3 text-left"
        initial="hidden"
        animate="visible"
        variants={{
          visible: { transition: { staggerChildren: 0.1, delayChildren: 0.6 } },
        }}
      >
        {nextSteps.map((step) => (
          <motion.div
            key={step}
            variants={{
              hidden: { opacity: 0, x: -20 },
              visible: { opacity: 1, x: 0 },
            }}
            className="flex items-center gap-3 rounded-lg bg-muted/50 px-4 py-3"
          >
            <CheckCircleIcon className="size-4 shrink-0 text-emerald-500" />
            <span className="text-sm">{step}</span>
          </motion.div>
        ))}
      </motion.div>

      {/* actions */}
      <motion.div
        className="mt-8 flex w-full max-w-sm flex-col gap-3"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.4 }}
      >
        <Button size="lg" className="w-full gap-2" onClick={onGoToDashboard}>
          <LayoutDashboardIcon className="size-4" />
          Go to Dashboard
          <ArrowRightIcon className="size-4" />
        </Button>
        <Button size="lg" variant="outline" className="w-full gap-2" onClick={onAddFirstProduct}>
          <PlusIcon className="size-4" />
          Add First Product
        </Button>
      </motion.div>
    </div>
  )
}
