import { motion } from 'framer-motion'
import { ArrowRight, Play } from 'lucide-react'

export function CTASection() {
  return (
    <section className="relative z-10 px-4 py-24 md:px-8 md:py-32 lg:px-16">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#6366F1] via-[#7C3AED] to-[#22D3EE] p-12 text-center shadow-2xl shadow-[#6366F1]/20 md:p-20"
        >
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-white/10 blur-3xl" />
            <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-white/5 blur-3xl" />
          </div>
          <div className="relative z-10">
            <h2 className="font-display text-4xl font-bold text-white md:text-5xl lg:text-6xl">
              Ready to Grow Your Store?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80">
              Join thousands of vendors already using our platform to manage and grow their
              e-commerce business.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="group inline-flex items-center gap-2 rounded-2xl bg-white px-8 py-4 text-base font-semibold text-[#6366F1] shadow-lg shadow-black/20 transition-all hover:shadow-xl"
              >
                Get Started
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-8 py-4 text-base font-medium text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                <Play className="h-4 w-4" />
                Book a Demo
              </motion.button>
            </div>
            <p className="mt-6 text-sm text-white/60">
              No credit card required &middot; 14-day free trial &middot; Cancel anytime
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
