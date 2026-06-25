import { motion } from 'framer-motion'
import { Pencil, MapPin, Truck, CreditCard, Store } from 'lucide-react'
import { Button } from '~/components/ui/button'
import type { Address, DeliveryMethod, PaymentMethod } from '~/types/checkout'
import type { GroupedCartItems } from '~/types/cart'

type ReviewStepProps = {
  address: Address | null
  deliveryMethod: DeliveryMethod | null
  storeDeliveryMethods: Record<string, DeliveryMethod | null>
  paymentMethod: PaymentMethod | null
  groupedItems: GroupedCartItems[]
  stores: { id: string; name: string }[]
  onEditAddress: () => void
  onEditDelivery: () => void
  onEditPayment: () => void
}

export function ReviewStep({
  address,
  deliveryMethod,
  storeDeliveryMethods,
  paymentMethod,
  groupedItems,
  stores,
  onEditAddress,
  onEditDelivery,
  onEditPayment,
}: ReviewStepProps) {
  const hasStoreDeliveryMethods = Object.keys(storeDeliveryMethods).length > 0

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
      className="space-y-6"
    >
      <div>
        <h2 className="text-lg font-semibold font-heading">Review Your Order</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Please review everything before placing your order.
        </p>
      </div>

      {/* Shipping Address */}
      <SectionCard
        icon={<MapPin className="size-4" />}
        title="Shipping Address"
        onEdit={onEditAddress}
      >
        {address && (
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">{address.fullName}</p>
            <p>{address.phoneNumber}</p>
            <p>
              {address.area}, {address.city}
            </p>
            <p>
              {address.district}, {address.province}
              {address.postalCode && ` - ${address.postalCode}`}
            </p>
            {address.landmark && <p className="mt-0.5">Near: {address.landmark}</p>}
          </div>
        )}
      </SectionCard>

      {/* Delivery Method */}
      <SectionCard
        icon={<Truck className="size-4" />}
        title="Delivery Method"
        onEdit={onEditDelivery}
      >
        {hasStoreDeliveryMethods ? (
          <div className="space-y-3">
            {stores.map((store) => {
              const method = storeDeliveryMethods[store.id]
              if (!method) return null
              return (
                <div key={store.id}>
                  <p className="text-xs font-medium text-foreground">{store.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {method.name} &middot; {method.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Estimated: {method.estimatedDate}
                  </p>
                </div>
              )
            })}
          </div>
        ) : deliveryMethod ? (
          <div>
            <p className="text-sm text-muted-foreground">
              {deliveryMethod.name} &middot; {deliveryMethod.description}
            </p>
            <p className="text-xs text-muted-foreground">
              Estimated Delivery: {deliveryMethod.estimatedDate}
            </p>
          </div>
        ) : null}
      </SectionCard>

      {/* Payment Method */}
      <SectionCard
        icon={<CreditCard className="size-4" />}
        title="Payment Method"
        onEdit={onEditPayment}
      >
        {paymentMethod && (
          <p className="text-sm text-muted-foreground">{paymentMethod.name}</p>
        )}
      </SectionCard>

      {/* Order Items */}
      <div className="rounded-xl border border-border/50 bg-card">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
          <Store className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Order Items</span>
        </div>

        <div className="divide-y divide-border/30">
          {groupedItems.map((group) => (
            <div key={group.storeId}>
              <div className="bg-muted/30 px-4 py-2">
                <p className="text-xs font-medium text-muted-foreground">{group.storeName}</p>
              </div>
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="size-12 rounded-lg bg-muted object-cover shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.color} / {item.size} &middot; Qty {item.quantity}
                    </p>
                  </div>
                  <p className="text-sm font-semibold tabular-nums shrink-0">
                    Rs. {(item.price * item.quantity).toLocaleString('ne-NP')}
                  </p>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

function SectionCard({
  icon,
  title,
  onEdit,
  children,
}: {
  icon: React.ReactNode
  title: string
  onEdit: () => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card">
      <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{icon}</span>
          <span className="text-sm font-medium">{title}</span>
        </div>
        <Button variant="ghost" size="xs" onClick={onEdit} className="gap-1 text-xs">
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  )
}
