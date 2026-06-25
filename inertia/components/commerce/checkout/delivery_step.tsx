import { motion } from 'framer-motion'
import { DeliveryMethodCard } from './delivery_method_card'
import type { DeliveryMethod } from '~/types/checkout'

type DeliveryStepProps = {
  methods: DeliveryMethod[]
  storeMethods: Record<string, DeliveryMethod[]>
  selectedMethodId: string | null
  storeSelections: Record<string, string>
  onSelect: (methodId: string) => void
  onStoreSelect: (storeId: string, methodId: string) => void
  isLoading: boolean
  stores: { id: string; name: string }[]
}

export function DeliveryStep({
  methods,
  storeMethods,
  selectedMethodId,
  storeSelections,
  onSelect,
  onStoreSelect,
  isLoading,
  stores,
}: DeliveryStepProps) {
  if (isLoading) return null

  const hasStoreMethods = Object.keys(storeMethods).length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
    >
      <div className="mb-6">
        <h2 className="text-lg font-semibold font-heading">Delivery Method</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose how quickly you want your order delivered.
        </p>
      </div>

      {hasStoreMethods ? (
        <div className="space-y-6">
          {stores.map((store) => {
            const storeDeliveryMethods = storeMethods[store.id]
            if (!storeDeliveryMethods) return null

            return (
              <div key={store.id}>
                <h3 className="mb-3 text-sm font-medium text-foreground">{store.name}</h3>
                <div className="space-y-2">
                  {storeDeliveryMethods.map((method) => (
                    <DeliveryMethodCard
                      key={method.id}
                      method={method}
                      selected={storeSelections[store.id] === method.id}
                      onSelect={() => onStoreSelect(store.id, method.id)}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="space-y-2" role="radiogroup" aria-label="Delivery methods">
          {methods.map((method) => (
            <DeliveryMethodCard
              key={method.id}
              method={method}
              selected={selectedMethodId === method.id}
              onSelect={() => onSelect(method.id)}
            />
          ))}
        </div>
      )}
    </motion.div>
  )
}
