import { motion } from 'framer-motion'
import { ProductResultCard } from './product_result_card'
import { StoreResultCard } from './store_result_card'
import type { SearchResults as SearchResultsType } from './types'

type SearchResultsProps = {
  results: SearchResultsType
  selectedIndex: number
}

export function SearchResults({ results, selectedIndex }: SearchResultsProps) {
  const totalItems =
    results.suggestions.length +
    results.products.length +
    results.stores.length +
    results.categories.length

  if (totalItems === 0) return null

  let globalIndex = -1

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="space-y-3"
    >
      {results.suggestions.length > 0 && (
        <div>
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Suggestions
          </h3>
          <div className="mt-0.5 space-y-0.5">
            {results.suggestions.map((s, i) => {
              globalIndex++
              const isSelected = globalIndex === selectedIndex
              return (
                <div
                  key={`s-${i}`}
                  className={`px-2 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <span className="text-muted-foreground/50 mr-2">↵</span>
                  {s.text}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {results.products.length > 0 && (
        <div>
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Products ({results.products.length})
          </h3>
          <div className="mt-0.5 space-y-0.5">
            {results.products.map((p) => {
              globalIndex++
              return (
                <ProductResultCard
                  key={p.id}
                  product={p}
                  isSelected={globalIndex === selectedIndex}
                />
              )
            })}
          </div>
        </div>
      )}

      {results.stores.length > 0 && (
        <div>
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Stores
          </h3>
          <div className="mt-0.5 space-y-0.5">
            {results.stores.map((s) => {
              globalIndex++
              return (
                <StoreResultCard key={s.id} store={s} isSelected={globalIndex === selectedIndex} />
              )
            })}
          </div>
        </div>
      )}

      {results.categories.length > 0 && (
        <div>
          <h3 className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Categories
          </h3>
          <div className="mt-0.5 space-y-0.5">
            {results.categories.map((c) => {
              globalIndex++
              const isSelected = globalIndex === selectedIndex
              return (
                <div
                  key={c.id}
                  className={`flex items-center justify-between px-2 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                    isSelected ? 'bg-muted' : 'hover:bg-muted/50'
                  }`}
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.productCount} products</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}
