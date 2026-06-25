import { motion } from 'framer-motion'
import { CheckCircle, Package, MapPin, Truck, ArrowRight } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Separator } from '~/components/ui/separator'
import { Link } from '@adonisjs/inertia/react'
import type { OrderConfirmation } from '~/types/checkout'

type OrderSuccessPageProps = {
  order: OrderConfirmation
}

const timeline = [
  { label: 'Order Placed', completed: true },
  { label: 'Processing', completed: false },
  { label: 'Shipped', completed: false },
  { label: 'Delivered', completed: false },
]

export function OrderSuccessPage({ order }: OrderSuccessPageProps) {
  const formatPrice = (value: number) => `Rs. ${value.toLocaleString('ne-NP')}`

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
      className="mx-auto max-w-2xl px-4 py-12 sm:px-6"
    >
      {/* Success Header */}
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1], delay: 0.1 }}
        className="text-center"
      >
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle className="size-8 text-green-500" />
        </div>
        <h1 className="text-2xl font-semibold font-heading">Order Confirmed!</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Thank you for your order. You&apos;ll receive a confirmation email shortly.
        </p>
      </motion.div>

      {/* Order Number */}
      <div className="mt-8 rounded-xl border border-border/50 bg-card p-4 text-center">
        <p className="text-xs text-muted-foreground">Order Number</p>
        <p className="mt-0.5 text-lg font-semibold tracking-tight">{order.orderNumber}</p>
      </div>

      {/* Timeline */}
      <div className="mt-8">
        <div className="relative flex items-center justify-between">
          {timeline.map((step, index) => (
            <div key={step.label} className="flex flex-col items-center">
              <div
                className={`flex size-8 items-center justify-center rounded-full text-xs font-medium ${
                  step.completed
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step.completed ? <CheckCircle className="size-4" /> : <span>{index + 1}</span>}
              </div>
              <span
                className={`mt-1.5 text-[10px] font-medium ${
                  step.completed ? 'text-foreground' : 'text-muted-foreground/50'
                }`}
              >
                {step.label}
              </span>
              {index < timeline.length - 1 && (
                <div className="absolute top-4 left-[calc((100%/4)*var(--i)+8px)] hidden sm:block" />
              )}
            </div>
          ))}
        </div>

        {/* Progress line */}
        <div className="relative mt-[-24px]">
          <div className="mx-auto h-px w-[75%] bg-border/50">
            <motion.div
              initial={{ width: '0%' }}
              animate={{ width: '25%' }}
              transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1], delay: 0.3 }}
              className="h-full bg-primary"
            />
          </div>
        </div>
      </div>

      {/* Estimated Delivery */}
      <div className="mt-8 flex items-center gap-3 rounded-xl border border-border/50 bg-card p-4">
        <Truck className="size-5 text-muted-foreground shrink-0" />
        <div>
          <p className="text-xs text-muted-foreground">Estimated Delivery</p>
          <p className="text-sm font-medium">{order.estimatedDelivery}</p>
        </div>
      </div>

      {/* Order Items */}
      <div className="mt-6 rounded-xl border border-border/50 bg-card">
        <div className="flex items-center gap-2 border-b border-border/50 px-4 py-3">
          <Package className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Order Items</span>
        </div>
        <div className="divide-y divide-border/30">
          {order.items.map((item) => (
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
      </div>

      {/* Shipping Address */}
      <div className="mt-4 flex items-start gap-3 rounded-xl border border-border/50 bg-card p-4">
        <MapPin className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-xs text-muted-foreground">Shipping Address</p>
          <p className="mt-0.5 text-sm font-medium">{order.shippingAddress.fullName}</p>
          <p className="text-xs text-muted-foreground">{order.shippingAddress.phoneNumber}</p>
          <p className="text-xs text-muted-foreground">
            {order.shippingAddress.area}, {order.shippingAddress.city},{' '}
            {order.shippingAddress.district}
          </p>
        </div>
      </div>

      {/* Order Total */}
      <div className="mt-4 rounded-xl border border-border/50 bg-card p-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{formatPrice(order.subtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Shipping</span>
            <span className="tabular-nums">
              {order.shipping === 0 ? 'Free' : formatPrice(order.shipping)}
            </span>
          </div>
          {order.discount > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Discount</span>
              <span className="text-green-600 dark:text-green-400 tabular-nums">
                -{formatPrice(order.discount)}
              </span>
            </div>
          )}
          <Separator />
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold">Total</span>
            <span className="text-base font-semibold tabular-nums">{formatPrice(order.total)}</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="flex-1 gap-2 rounded-xl h-11 text-sm" asChild>
          <Link href="/orders">
            Track Order
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button size="lg" variant="outline" className="flex-1 rounded-xl h-11 text-sm" asChild>
          <Link href="/">Continue Shopping</Link>
        </Button>
      </div>
    </motion.div>
  )
}
