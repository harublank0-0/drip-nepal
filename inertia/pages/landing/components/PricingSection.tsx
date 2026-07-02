import { motion } from 'framer-motion'
import { Check } from 'lucide-react'

const plans = [
  {
    name: 'Starter',
    price: '$29',
    period: '/month',
    description: 'Perfect for small stores just getting started.',
    features: [
      'Up to 100 products',
      'Basic analytics',
      'Order management',
      'Email support',
      '1 store connection',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    name: 'Pro',
    price: '$79',
    period: '/month',
    description: 'For growing businesses that need more power.',
    features: [
      'Unlimited products',
      'Advanced analytics & reports',
      'Automated inventory',
      'Priority support',
      'Up to 5 store connections',
      'API access',
      'Custom integrations',
    ],
    cta: 'Start Free Trial',
    popular: true,
  },
  {
    name: 'Enterprise',
    price: '$199',
    period: '/month',
    description: 'For large operations with advanced needs.',
    features: [
      'Everything in Pro',
      'Unlimited store connections',
      'Dedicated account manager',
      'Custom reporting',
      'SLA guarantee',
      'White-label option',
      '24/7 phone support',
    ],
    cta: 'Contact Sales',
    popular: false,
  },
]

export function PricingSection() {
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
            Pricing
          </span>
          <h2 className="font-display text-4xl font-bold text-white md:text-5xl">
            Simple pricing.{' '}
            <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
              No hidden fees.
            </span>
          </h2>
          <p className="mt-4 text-lg text-gray-400">Start free and upgrade as you grow.</p>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {plans.map((plan, i) => (
            <motion.div
              key={plan.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              className={`relative overflow-hidden rounded-2xl border p-8 transition-all duration-500 ${
                plan.popular
                  ? 'border-[#6366F1]/30 bg-gradient-to-b from-[#6366F1]/10 to-transparent shadow-xl shadow-[#6366F1]/10'
                  : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]'
              }`}
            >
              {plan.popular && (
                <div className="absolute top-0 right-0">
                  <div className="flex h-20 w-20 translate-x-8 -translate-y-8 rotate-12 items-end justify-center bg-gradient-to-br from-[#6366F1] to-[#8B5CF6] shadow-lg shadow-[#6366F1]/25">
                    <span className="mb-2 text-[10px] font-semibold tracking-wider text-white">
                      POPULAR
                    </span>
                  </div>
                </div>
              )}
              <div className="mb-6">
                <h3 className="font-display text-xl font-semibold text-white">{plan.name}</h3>
                <p className="mt-1 text-sm text-gray-500">{plan.description}</p>
              </div>
              <div className="mb-6">
                <span className="font-display text-5xl font-bold text-white">{plan.price}</span>
                <span className="ml-1 text-sm text-gray-500">{plan.period}</span>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`w-full rounded-xl py-3 text-sm font-semibold transition-all ${
                  plan.popular
                    ? 'bg-gradient-to-r from-[#6366F1] to-[#8B5CF6] text-white shadow-lg shadow-[#6366F1]/25 hover:shadow-xl hover:shadow-[#6366F1]/30'
                    : 'border border-white/[0.1] bg-white/[0.05] text-white hover:bg-white/[0.1]'
                }`}
              >
                {plan.cta}
              </motion.button>
              <ul className="mt-8 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-sm text-gray-400">
                    <Check className="h-4 w-4 shrink-0 text-[#10B981]" />
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
