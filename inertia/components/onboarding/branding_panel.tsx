import { motion } from 'framer-motion'
import { CheckIcon, StoreIcon, UsersIcon, PackageIcon, TrendingUpIcon } from 'lucide-react'
import { Typography } from '~/components/ui/typography'

const benefits = [
  { icon: StoreIcon, text: 'Start selling in minutes' },
  { icon: UsersIcon, text: 'Reach customers across Nepal' },
  { icon: PackageIcon, text: 'Manage products and orders easily' },
  { icon: TrendingUpIcon, text: 'Grow your business with analytics' },
]

const floatingShapes = [
  { size: 64, x: '15%', y: '20%', delay: 0, duration: 6 },
  { size: 32, x: '75%', y: '15%', delay: 1.5, duration: 5 },
  { size: 48, x: '20%', y: '75%', delay: 0.8, duration: 7 },
  { size: 40, x: '80%', y: '70%', delay: 2, duration: 5.5 },
  { size: 24, x: '50%', y: '50%', delay: 1.2, duration: 4.5 },
]

export function BrandingPanel() {
  return (
    <div className="relative hidden overflow-hidden lg:flex lg:flex-col lg:justify-center lg:px-12 lg:py-16">
      {/* gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/10 to-background" />

      {/* glow effect */}
      <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-32 size-80 rounded-full bg-primary/5 blur-3xl" />

      {/* floating shapes */}
      {floatingShapes.map((shape, i) => (
        <motion.div
          key={i}
          className="pointer-events-none absolute rounded-full border border-primary/10 bg-primary/5"
          style={{
            width: shape.size,
            height: shape.size,
            left: shape.x,
            top: shape.y,
          }}
          animate={{
            y: [0, -20, 0],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: shape.duration,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: shape.delay,
          }}
        />
      ))}

      {/* content */}
      <div className="relative z-10 max-w-lg">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Typography.H1 className="text-3xl font-heading font-bold tracking-tight lg:text-4xl">
            Welcome to <span className="text-primary">Drip Nepal</span>
          </Typography.H1>
          <Typography.P className="mt-3 text-base text-muted-foreground leading-relaxed">
            Help thousands of customers discover your products. Join Nepal&apos;s fastest-growing
            marketplace for fashion and lifestyle.
          </Typography.P>
        </motion.div>

        <motion.div
          className="mt-10 space-y-3"
          initial="hidden"
          animate="visible"
          variants={{
            visible: { transition: { staggerChildren: 0.1, delayChildren: 0.3 } },
          }}
        >
          {benefits.map((benefit) => (
            <motion.div
              key={benefit.text}
              variants={{
                hidden: { opacity: 0, x: -20 },
                visible: { opacity: 1, x: 0 },
              }}
              className="flex items-center gap-3 rounded-xl bg-background/50 p-3.5 backdrop-blur-sm ring-1 ring-foreground/5"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                <CheckIcon className="size-4 text-primary" />
              </span>
              <benefit.icon className="size-4 shrink-0 text-muted-foreground" />
              <span className="text-sm font-medium">{benefit.text}</span>
            </motion.div>
          ))}
        </motion.div>

        <motion.p
          className="mt-8 text-sm text-muted-foreground italic"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          Creating your shop takes less than 2 minutes.
        </motion.p>
      </div>
    </div>
  )
}
