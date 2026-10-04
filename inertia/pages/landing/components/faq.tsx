import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'

const faqs = [
  {
    q: 'How secure is my data?',
    a: 'We use enterprise-grade encryption (AES-256) for all data at rest and TLS 1.3 for data in transit. Our infrastructure is SOC 2 compliant and hosted on AWS with automatic backups. Your data is encrypted end-to-end and never shared with third parties.',
  },
  {
    q: 'Can I manage multiple stores?',
    a: 'Yes! Our Pro plan supports up to 5 stores, and the Enterprise plan supports unlimited stores. You can switch between stores seamlessly from a single dashboard and view consolidated analytics across all your stores.',
  },
  {
    q: 'Do you support refunds?',
    a: 'Absolutely. We offer a 14-day free trial for all plans, and our Pro plan comes with a 30-day money-back guarantee. Enterprise customers get custom terms based on their needs.',
  },
  {
    q: 'Can my team collaborate?',
    a: 'Yes, every plan supports team collaboration. You can invite team members with custom roles and permissions. Enterprise plans include advanced team management features like approval workflows and audit logs.',
  },
  {
    q: 'What payment methods do you support?',
    a: 'We support all major payment methods including credit/debit cards (Visa, Mastercard, Amex), PayPal, and bank transfers for Enterprise plans. All payments are processed securely through Stripe.',
  },
  {
    q: 'Do you offer API access?',
    a: 'Yes, API access is available on Pro and Enterprise plans. Our RESTful API allows you to integrate with your existing tools, automate workflows, and build custom solutions on top of our platform.',
  },
]

export function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <section className="relative z-10 py-24 md:py-32">
      <div className="mx-auto max-w-3xl px-4 md:px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-[#6366F1]/20 bg-[#6366F1]/10 px-3 py-1 text-xs font-medium text-[#6366F1]">
            FAQ
          </span>
          <h2 className="font-display text-4xl font-bold text-white md:text-5xl">
            Got questions?{' '}
            <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
              We&rsquo;ve got answers.
            </span>
          </h2>
        </motion.div>

        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.03] transition-all duration-300 hover:border-white/[0.12]"
            >
              <button
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="flex w-full items-center justify-between px-6 py-5 text-left"
                aria-expanded={openIndex === i}
              >
                <span className="text-sm font-medium text-gray-300">{faq.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-300 ${openIndex === i ? 'rotate-180' : ''}`}
                />
              </button>
              <AnimatePresence>
                {openIndex === i && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.25, 0.1, 0, 1] as const }}
                    className="overflow-hidden"
                  >
                    <p className="border-t border-white/[0.06] px-6 py-5 text-sm leading-relaxed text-gray-500">
                      {faq.a}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
