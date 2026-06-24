import { Banknote, RefreshCw, Shield } from 'lucide-react'

const deliveryFeatures = [
  {
    icon: Banknote,
    title: 'Cash on Delivery',
    description: 'Pay when you receive',
  },
  {
    icon: RefreshCw,
    title: 'Free Returns',
    description: 'Within 7 days of delivery',
  },
  {
    icon: Shield,
    title: 'Secure Payments',
    description: 'Your data is protected',
  },
]

export function DeliveryInfo() {
  return (
    <div className="grid grid-cols-3 gap-3">
      {deliveryFeatures.map((feature) => (
        <div
          key={feature.title}
          className="flex flex-col items-center gap-1.5 rounded-lg border border-border/50 bg-muted/30 p-3 text-center"
        >
          <feature.icon className="size-4 text-muted-foreground" />
          <span className="text-[11px] font-medium leading-tight">{feature.title}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">
            {feature.description}
          </span>
        </div>
      ))}
    </div>
  )
}
