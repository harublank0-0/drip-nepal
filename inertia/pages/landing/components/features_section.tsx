import { motion } from 'framer-motion'
import { Package, ShoppingCart, BarChart3, Users, Wallet, Bell } from 'lucide-react'

const features = [
  {
    icon: Package,
    title: 'Inventory Management',
    description: 'Track stock in real time with automated alerts and smart reordering.',
    color: '#22D3EE',
  },
  {
    icon: ShoppingCart,
    title: 'Order Management',
    description: 'Manage incoming orders effortlessly with a unified dashboard.',
    color: '#10B981',
  },
  {
    icon: BarChart3,
    title: 'Sales Analytics',
    description: 'Beautiful charts and actionable insights to grow your revenue.',
    color: '#6366F1',
  },
  {
    icon: Users,
    title: 'Customer Management',
    description: 'Understand your buyers with detailed profiles and history.',
    color: '#8B5CF6',
  },
  {
    icon: Wallet,
    title: 'Payment Tracking',
    description: 'Track every transaction and reconcile payments automatically.',
    color: '#22D3EE',
  },
  {
    icon: Bell,
    title: 'Smart Notifications',
    description: 'Never miss an important event with intelligent alerts.',
    color: '#F59E0B',
  },
]

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { transition: { staggerChildren: 0.1 } },
}

const cardVariants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.1, 0, 1] as const } },
}

export function FeaturesSection() {
  return (
    <section className="relative z-10 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-[#6366F1]/20 bg-[#6366F1]/10 px-3 py-1 text-xs font-medium text-[#6366F1]">
            Features
          </span>
          <h2 className="font-display text-4xl font-bold text-white md:text-5xl">
            Everything you need to{' '}
            <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
              scale your store
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">
            Powerful tools to manage, analyze, and grow your e-commerce business.
          </p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {features.map((feature) => {
            const Icon = feature.icon
            return (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.06]"
              >
                <div
                  className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full opacity-0 blur-3xl transition-all duration-500 group-hover:opacity-20"
                  style={{ background: feature.color }}
                />
                <div
                  className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.04] transition-all duration-500 group-hover:scale-110 group-hover:border-white/[0.15]"
                  style={{ color: feature.color }}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <h3 className="mb-2 font-display text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="text-sm leading-relaxed text-gray-400">{feature.description}</p>
              </motion.div>
            )
          })}
        </motion.div>
      </div>
    </section>
  )
}
