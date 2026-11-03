import { motion } from 'framer-motion'
import { Star } from 'lucide-react'

const testimonials = [
  {
    name: 'Sarah Chen',
    company: 'Fashion Hub',
    role: 'Founder',
    review:
      'This platform transformed how I manage my store. The analytics alone save me hours every week. I can finally focus on growing my business instead of getting bogged down in operations.',
    rating: 5,
    gradient: 'from-[#6366F1] to-[#8B5CF6]',
  },
  {
    name: 'Marcus Johnson',
    company: 'TechGear Store',
    role: 'CEO',
    review:
      'The inventory management is a game-changer. Automatic reorder alerts have saved us from stockouts multiple times. Our revenue has grown 40% since switching to this platform.',
    rating: 5,
    gradient: 'from-[#22D3EE] to-[#6366F1]',
  },
  {
    name: 'Priya Patel',
    company: 'Artisan Market',
    role: 'Owner',
    review:
      'Managing multiple stores was a nightmare until we found this. Now I can see all my metrics in one beautiful dashboard. The customer support team is exceptional too.',
    rating: 5,
    gradient: 'from-[#8B5CF6] to-[#22D3EE]',
  },
]

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-4 w-4 ${i < rating ? 'fill-[#F59E0B] text-[#F59E0B]' : 'fill-white/[0.05] text-white/[0.1]'}`}
        />
      ))}
    </div>
  )
}

export function Testimonials() {
  return (
    <section className="relative z-10 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-4 md:px-8 lg:px-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mx-auto mb-16 max-w-2xl text-center"
        >
          <span className="mb-4 inline-block rounded-full border border-[#F59E0B]/20 bg-[#F59E0B]/10 px-3 py-1 text-xs font-medium text-[#F59E0B]">
            Testimonials
          </span>
          <h2 className="font-display text-4xl font-bold text-white md:text-5xl">
            Loved by{' '}
            <span className="bg-gradient-to-r from-[#6366F1] to-[#22D3EE] bg-clip-text text-transparent">
              thousands of vendors
            </span>
          </h2>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-3">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.5 }}
              whileHover={{ y: -8, transition: { duration: 0.3 } }}
              className="group relative overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-8 transition-all duration-500 hover:border-white/[0.12] hover:bg-white/[0.06] hover:shadow-xl hover:shadow-[#6366F1]/5"
            >
              <div
                className="absolute top-0 right-0 h-32 w-32 translate-x-8 -translate-y-8 rounded-full opacity-0 blur-3xl transition-all duration-500 group-hover:opacity-20"
                style={{ background: 'linear-gradient(135deg, #6366F1, #22D3EE)' }}
              />
              <StarRating rating={t.rating} />
              <p className="mt-4 text-sm leading-relaxed text-gray-400">&ldquo;{t.review}&rdquo;</p>
              <div className="mt-6 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-full bg-gradient-to-br ${t.gradient}`} />
                <div>
                  <div className="text-sm font-semibold text-white">{t.name}</div>
                  <div className="text-xs text-gray-500">
                    {t.company} &middot; {t.role}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
