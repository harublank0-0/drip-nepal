import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { LucideCircleCheck } from 'lucide-react'
import DripNepalLogo from '~/assets/logo/drip-nepal.png'
import { Typography } from '~/components/ui/typography'

type BrandingPanelProps = {
  heading?: ReactNode
  subheading?: string
  benefits?: string[]
}

const defaultBenefits = [
  'Fast delivery',
  'Secure checkout',
  'Trusted local sellers',
  'Easy order tracking',
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: [0.32, 0.72, 0, 1] },
  },
}

export function BrandingPanel({
  heading,
  subheading,
  benefits = defaultBenefits,
}: BrandingPanelProps) {
  return (
    <div className="relative flex h-full min-h-[100dvh] w-full flex-col justify-center overflow-hidden bg-gradient-to-br from-primary/5 via-primary/[0.08] to-background px-8 py-16 lg:px-16">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -left-32 -top-32 h-80 w-80 rounded-full border border-primary/10"
          style={{ animation: 'shape-drift 25s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-40 -right-20 h-96 w-96 rounded-full border border-primary/10"
          style={{ animation: 'shape-drift-reverse 30s ease-in-out infinite' }}
        />
        <div
          className="absolute left-1/3 top-1/3 h-48 w-48 rounded-full bg-primary/[0.04] blur-3xl"
          style={{ animation: 'shape-pulse 8s ease-in-out infinite' }}
        />
      </div>

      <motion.div
        className="relative z-10 flex flex-col gap-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div variants={itemVariants} className="flex items-center gap-3">
          <figure className="flex h-10 w-10 items-center justify-center rounded-full bg-black">
            <img src={DripNepalLogo} alt="" className="h-6 w-6" aria-hidden="true" />
          </figure>
          <span className="text-lg font-semibold tracking-tight">Drip Nepal</span>
        </motion.div>

        <motion.div variants={itemVariants} className="flex flex-col gap-4">
          {heading ? (
            <Typography.H1 className="!mt-0 text-left text-4xl leading-tight lg:text-5xl">
              {heading}
            </Typography.H1>
          ) : (
            <Typography.H1 className="!mt-0 text-left text-4xl leading-tight lg:text-5xl">
              Discover amazing products
              <br />
              <span className="text-primary">from local shops.</span>
            </Typography.H1>
          )}
          <Typography.P className="!mt-0 max-w-md text-base text-muted-foreground lg:text-lg">
            {subheading ?? 'Join thousands of customers shopping across Nepal.'}
          </Typography.P>
        </motion.div>

        <motion.ul variants={itemVariants} className="flex flex-col gap-3">
          {benefits.map((benefit) => (
            <li key={benefit} className="flex items-center gap-3 text-sm text-foreground/80">
              <LucideCircleCheck size={18} className="shrink-0 text-primary" />
              {benefit}
            </li>
          ))}
        </motion.ul>
      </motion.div>
    </div>
  )
}
