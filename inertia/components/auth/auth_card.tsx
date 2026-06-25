import { motion, useReducedMotion } from 'framer-motion'
import React from 'react'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.07,
      delayChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.7,
      ease: [0.32, 0.72, 0, 1],
    },
  },
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  const prefersReducedMotion = useReducedMotion()

  const variants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : containerVariants

  const childVariants = prefersReducedMotion
    ? { hidden: { opacity: 1 }, visible: { opacity: 1 } }
    : itemVariants

  return (
    <div className="relative flex min-h-dvh w-full items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div
          className="absolute -left-48 -top-48 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
          style={{ animation: 'orb-float 20s ease-in-out infinite' }}
        />
        <div
          className="absolute -bottom-48 -right-48 h-96 w-96 rounded-full bg-primary/10 blur-[120px]"
          style={{ animation: 'orb-float-delayed 25s ease-in-out infinite' }}
        />
      </div>

      <div className="relative z-10 w-full max-w-md">
        <div className="rounded-[2rem] bg-black/5 p-1.5 ring-1 ring-black/5 dark:bg-white/5 dark:ring-white/5">
          <div className="rounded-[1.625rem] bg-card p-8 shadow-[inset_0_1px_1px_rgba(255,255,255,0.15)] sm:p-10">
            <motion.div
              className="flex flex-col gap-6"
              variants={variants}
              initial="hidden"
              animate="visible"
            >
              {React.Children.map(children, (child) => {
                if (React.isValidElement(child)) {
                  return <motion.div variants={childVariants}>{child}</motion.div>
                }
                return child
              })}
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}
