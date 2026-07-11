import { motion } from 'framer-motion'
import { AnimatedCounter } from './AnimatedCounter'

const stats = [
  { value: 120, suffix: 'K+', label: 'Products Managed' },
  { value: 15, suffix: 'M+', label: 'Orders Processed' },
  { value: 98, suffix: '%', label: 'Customer Satisfaction' },
  { value: 99.99, suffix: '%', label: 'Uptime', decimals: 2 },
]

export function StatisticsSection() {
  return (
    <section className="relative z-10 border-y border-white/[0.04] py-20 md:py-28">
      <div className="mx-auto max-w-7xl px-4 md:px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-12 max-w-2xl text-center"
        >
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">
            Trusted by vendors worldwide
          </h2>
        </motion.div>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className="group text-center"
            >
              <div className="mb-2 font-display text-5xl font-bold text-white md:text-6xl">
                <AnimatedCounter
                  end={stat.value}
                  suffix={stat.suffix}
                  decimals={stat.decimals ?? 0}
                />
              </div>
              <div className="text-sm text-gray-500">{stat.label}</div>
              <div className="mx-auto mt-4 h-0.5 w-0 rounded-full bg-gradient-to-r from-[#6366F1] to-[#22D3EE] transition-all duration-500 group-hover:w-16" />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
