import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '~/lib/utils'
import type { ProductData } from '../mock'

type ProductDescriptionProps = {
  product: ProductData
}

const tabs = [
  { id: 'description', label: 'Description' },
  { id: 'specifications', label: 'Specifications' },
  { id: 'shipping', label: 'Shipping & Returns' },
] as const

export function ProductDescription({ product }: ProductDescriptionProps) {
  const [activeTab, setActiveTab] = useState<string>('description')

  return (
    <section aria-label="Product details" className="py-12 md:py-16">
      <div className="border-b border-border" role="tablist" aria-label="Product details tabs">
        <div className="flex gap-0 -mb-px">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              aria-selected={activeTab === tab.id}
              aria-controls={`panel-${tab.id}`}
              className={cn(
                'relative px-5 py-3 text-sm font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
                activeTab === tab.id
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {activeTab === tab.id && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-foreground"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          role="tabpanel"
          id={`panel-${activeTab}`}
          className="pt-6"
        >
          {activeTab === 'description' && (
            <div className="prose prose-sm max-w-none text-muted-foreground leading-relaxed">
              <p>{product.description}</p>
            </div>
          )}

          {activeTab === 'specifications' && (
            <dl className="divide-y divide-border">
              {product.specifications.map((spec) => (
                <div key={spec.label} className="flex flex-col sm:flex-row sm:gap-4 py-3 sm:py-4">
                  <dt className="text-sm font-medium text-foreground sm:w-1/3 flex-shrink-0">
                    {spec.label}
                  </dt>
                  <dd className="text-sm text-muted-foreground mt-0.5 sm:mt-0">{spec.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {activeTab === 'shipping' && (
            <div className="text-sm text-muted-foreground leading-relaxed">
              <p>{product.shippingReturns}</p>
              <ul className="mt-4 space-y-2">
                <li className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-emerald-500 mt-0.5 flex-shrink-0"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Free shipping on orders over Rs. 5,000
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-emerald-500 mt-0.5 flex-shrink-0"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Standard delivery: 3-5 business days
                </li>
                <li className="flex items-start gap-2">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-emerald-500 mt-0.5 flex-shrink-0"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  Easy returns within 14 days
                </li>
              </ul>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}
