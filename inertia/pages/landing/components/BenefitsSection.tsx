import { motion } from 'framer-motion'
import { Check, Clock, BarChart3, Package2, Zap, Shield, Layers } from 'lucide-react'

const benefits = [
  { icon: Clock, text: 'Save hours every week with automation' },
  { icon: BarChart3, text: 'Real-time analytics at your fingertips' },
  { icon: Package2, text: 'Automated inventory management' },
  { icon: Zap, text: 'Faster order fulfillment workflows' },
  { icon: Shield, text: 'Secure payments with fraud protection' },
  { icon: Layers, text: 'Multiple store support from one dashboard' },
]

export function BenefitsSection() {
  return (
    <section className="relative z-10 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8 lg:px-16">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          {/* Left - Illustration */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-r from-[#6366F1]/20 via-[#8B5CF6]/20 to-[#22D3EE]/10 blur-3xl" />
            <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#141B2D] p-8 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#6366F1] to-[#8B5CF6]">
                  <Package2 className="h-5 w-5 text-white" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Smart Dashboard</div>
                  <div className="text-xs text-gray-500">All your stores in one place</div>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Store 1 - Fashion Hub', revenue: '+24%', color: '#10B981' },
                  { label: 'Store 2 - Tech Gear', revenue: '+18%', color: '#6366F1' },
                  { label: 'Store 3 - Home Decor', revenue: '+32%', color: '#22D3EE' },
                ].map((store) => (
                  <motion.div
                    key={store.label}
                    className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4"
                    whileHover={{ x: 4 }}
                    transition={{ type: 'spring', stiffness: 300 }}
                  >
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-medium text-gray-300">{store.label}</span>
                      <span className="text-xs font-semibold" style={{ color: store.color }}>
                        {store.revenue}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: store.color }}
                        initial={{ width: 0 }}
                        whileInView={{ width: `${Math.random() * 60 + 30}%` }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.8, delay: 0.2 }}
                      />
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Right - Benefits List */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <span className="mb-4 inline-block rounded-full border border-[#10B981]/20 bg-[#10B981]/10 px-3 py-1 text-xs font-medium text-[#10B981]">
              Why choose us
            </span>
            <h2 className="mb-6 font-display text-4xl font-bold text-white md:text-5xl">
              Built for serious{' '}
              <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
                e-commerce vendors
              </span>
            </h2>
            <div className="space-y-4">
              {benefits.map((benefit, i) => {
                const Icon = benefit.icon
                return (
                  <motion.div
                    key={benefit.text}
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1 }}
                    className="flex items-start gap-4 rounded-2xl border border-white/[0.04] bg-white/[0.02] p-4 transition-all duration-300 hover:border-white/[0.08] hover:bg-white/[0.04]"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6366F1]/10">
                      <Icon className="h-4 w-4 text-[#6366F1]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-300">{benefit.text}</p>
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#10B981]/10">
                      <Check className="h-4 w-4 text-[#10B981]" />
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
