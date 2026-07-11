import { toast } from 'sonner'
import {
  BanknoteIcon,
  CreditCardIcon,
  LandmarkIcon,
  ShieldCheckIcon,
  WalletIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import { Show } from '~/components/ui/show'
import { cn } from '~/lib/utils'
import { SectionCard } from '../components/section-card'
import type { PaymentMethodKey, PaymentSettingsState } from '../types'

type PaymentSettingsProps = {
  value: PaymentSettingsState
  onChange: (next: PaymentSettingsState) => void
}

const methodIcons: Record<PaymentMethodKey, LucideIcon> = {
  stripe: CreditCardIcon,
  paypal: WalletIcon,
  bank_transfer: LandmarkIcon,
  cod: BanknoteIcon,
}

const methodOrder: PaymentMethodKey[] = ['stripe', 'paypal', 'bank_transfer', 'cod']

export function PaymentSettings({ value, onChange }: PaymentSettingsProps) {
  const toggleConnection = (key: PaymentMethodKey) => {
    const method = value[key]
    const nextConnected = !method.connected

    onChange({
      ...value,
      [key]: {
        ...method,
        connected: nextConnected,
        verified: nextConnected ? method.verified : false,
      },
    })

    toast[nextConnected ? 'success' : 'info'](
      nextConnected ? `${method.label} connected` : `${method.label} disconnected`
    )
  }

  return (
    <SectionCard
      icon={CreditCardIcon}
      title="Payment Settings"
      description="Manage the payment methods available to your customers at checkout."
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {methodOrder.map((key) => {
          const method = value[key]
          const Icon = methodIcons[key]

          return (
            <div key={key} className="flex flex-col gap-3 rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-foreground" />
                  </span>
                  <div>
                    <p className="text-sm font-medium">{method.label}</p>
                    <p className="text-sm text-muted-foreground">{method.description}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Badge
                  variant={method.connected ? 'default' : 'outline'}
                  className={cn(
                    method.connected && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  )}
                >
                  {method.connected ? 'Connected' : 'Not connected'}
                </Badge>
                <Show when={method.connected}>
                  <Badge variant={method.verified ? 'secondary' : 'outline'}>
                    <ShieldCheckIcon />
                    {method.verified ? 'Verified' : 'Pending verification'}
                  </Badge>
                </Show>
              </div>

              <Button
                type="button"
                variant={method.connected ? 'outline' : 'default'}
                size="sm"
                onClick={() => toggleConnection(key)}
                className="mt-auto w-full"
              >
                {method.connected ? 'Disconnect' : 'Connect'}
              </Button>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}
