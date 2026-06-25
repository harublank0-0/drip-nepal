import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, MapPin, Check } from 'lucide-react'
import { cn } from '~/lib/utils'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { AddressForm } from './address_form'
import type { Address, AddressFormData } from '~/types/checkout'

type AddressStepProps = {
  addresses: Address[]
  selectedAddressId: string | null
  onSelect: (id: string) => void
  onAddAddress: (data: AddressFormData) => void
  isLoading: boolean
}

export function AddressStep({
  addresses,
  selectedAddressId,
  onSelect,
  onAddAddress,
  isLoading,
}: AddressStepProps) {
  const [isAdding, setIsAdding] = useState(false)

  if (isLoading) {
    return null
  }

  const handleAddAddress = (data: AddressFormData) => {
    onAddAddress(data)
    setIsAdding(false)
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-lg font-semibold font-heading">Shipping Address</h2>
        <p className="mt-1 text-sm text-muted-foreground">Where should we deliver your order?</p>
      </div>

      <AnimatePresence mode="wait">
        {isAdding ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
          >
            <AddressForm onSubmit={handleAddAddress} onCancel={() => setIsAdding(false)} />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
            className="space-y-3"
          >
            {addresses.map((address) => (
              <Card
                key={address.id}
                className={cn(
                  'cursor-pointer transition-all',
                  selectedAddressId === address.id
                    ? 'border-primary shadow-xs'
                    : 'hover:border-border'
                )}
                onClick={() => onSelect(address.id)}
                role="radio"
                aria-checked={selectedAddressId === address.id}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(address.id)
                  }
                }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors',
                        selectedAddressId === address.id
                          ? 'border-primary bg-primary'
                          : 'border-input'
                      )}
                    >
                      {selectedAddressId === address.id && (
                        <Check className="size-2.5 text-primary-foreground" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{address.label}</span>
                        {address.isDefault && (
                          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                            Default
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {address.fullName} &middot; {address.phoneNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {address.area}, {address.city}, {address.district}, {address.province}
                        {address.postalCode && ` - ${address.postalCode}`}
                      </p>
                      {address.landmark && (
                        <p className="mt-0.5 text-xs text-muted-foreground/70">
                          Near: {address.landmark}
                        </p>
                      )}
                    </div>

                    <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            ))}

            <Button
              variant="outline"
              onClick={() => setIsAdding(true)}
              className="w-full gap-2 rounded-xl border-dashed py-6 text-sm"
            >
              <Plus className="size-4" />
              Add New Address
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
