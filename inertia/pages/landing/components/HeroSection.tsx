import { useRef } from 'react'
import { motion } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'
import { DashboardMockup } from './DashboardMockup'

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1, delayChildren: 0.2 } },
}

const itemVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 0.1, 0, 1] as const } },
}

function MagneticButton({ children, className, ...props }: React.ComponentProps<'button'>) {
  const ref = useRef<HTMLButtonElement>(null)
  const handleMouse = (e: React.MouseEvent) => {
    const btn = ref.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    btn.style.transform = `translate(${x * 0.3}px, ${y * 0.3}px)`
  }
  const handleLeave = () => {
    if (ref.current) ref.current.style.transform = 'translate(0, 0)'
  }
  return (
    <button
      ref={ref}
      className={className}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      {...props}
    >
      {children}
    </button>
  )
}

export function HeroSection() {
  return (
    <section className="relative z-10 flex min-h-screen items-center overflow-hidden px-4 pt-32 pb-24 md:px-8 lg:px-16">
      <div className="mx-auto grid w-full max-w-7xl items-center gap-16 lg:grid-cols-2">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="relative z-10"
        >
          <motion.div
            variants={itemVariants}
            className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#6366F1]/20 bg-[#6366F1]/10 px-4 py-1.5 text-sm text-[#6366F1]"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#22D3EE] opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#22D3EE]" />
            </span>
            Now available in Early Access
          </motion.div>

          <motion.h1
            variants={itemVariants}
            className="font-display text-5xl leading-[1.1] tracking-tight text-white md:text-6xl lg:text-7xl xl:text-8xl"
          >
            Grow Your Business From{' '}
            <span className="bg-gradient-to-r from-[#6366F1] via-[#8B5CF6] to-[#22D3EE] bg-clip-text text-transparent">
              One Powerful Dashboard
            </span>
          </motion.h1>

          <motion.p
            variants={itemVariants}
            className="mt-6 max-w-xl text-lg leading-relaxed text-gray-400 md:text-xl"
          >
            Manage products, orders, customers, analytics, inventory, and payments—all from one
            intelligent platform designed for modern vendors.
          </motion.p>

          <motion.div variants={itemVariants} className="mt-10 flex flex-wrap items-center gap-4">
            <MagneticButton className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] px-8 py-4 text-base font-semibold text-white shadow-lg shadow-[#6366F1]/25 transition-all duration-300 hover:shadow-xl hover:shadow-[#6366F1]/30 active:scale-[0.98]">
              <span className="relative z-10 flex items-center gap-2">
                Start Selling
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </span>
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-[#8B5CF6] to-[#6366F1] transition-transform duration-500 group-hover:translate-x-0" />
            </MagneticButton>

            <MagneticButton className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition-all duration-300 hover:border-white/20 hover:bg-white/10 active:scale-[0.98]">
              <Play className="h-4 w-4" />
              View Demo
            </MagneticButton>
          </motion.div>

          <motion.div
            variants={itemVariants}
            className="mt-12 flex items-center gap-8 text-sm text-gray-500"
          >
            <span className="flex items-center gap-2">
              <span className="flex -space-x-2">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-8 w-8 rounded-full border-2 border-[#0B1020] bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]"
                  />
                ))}
              </span>
              <span className="text-gray-400">
                Trusted by <span className="font-semibold text-white">12,000+</span> vendors
              </span>
            </span>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4, ease: [0.25, 0.1, 0, 1] as const }}
          className="relative hidden lg:block"
        >
          <DashboardMockup />
        </motion.div>
      </div>
    </section>
  )
}
