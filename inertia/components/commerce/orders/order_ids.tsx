import { useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { Button } from '~/components/ui/button'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked: the ID is on screen to copy by hand.
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-10 shrink-0 rounded-lg"
      onClick={copy}
      aria-label={copied ? 'Copied' : `Copy order ID ${text}`}
    >
      {copied ? (
        <CheckIcon className="size-4" aria-hidden="true" />
      ) : (
        <CopyIcon className="size-4" aria-hidden="true" />
      )}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

/*
 * The order IDs, large, with a copy button. A guest needs them, with their
 * mobile number, to check on the order later.
 */
export function OrderIds({ orders, guest }: { orders: Data.Order[]; guest: boolean }) {
  return (
    <section
      aria-label={orders.length > 1 ? 'Your order IDs' : 'Your order ID'}
      className="mt-8 rounded-xl border border-border/60 bg-card p-4"
    >
      <p className="text-sm text-muted-foreground">
        {orders.length > 1 ? 'Your order IDs' : 'Your order ID'}
      </p>
      <ul className="mt-2 space-y-2">
        {orders.map((order) => (
          <li key={order.id} className="flex items-center justify-between gap-3">
            <span className="font-mono text-xl font-semibold tracking-wide break-all sm:text-2xl">
              {order.orderNumber}
            </span>
            <CopyButton text={order.orderNumber} />
          </li>
        ))}
      </ul>
      {guest && (
        <p className="mt-3 text-sm text-muted-foreground">
          Save it. To check on your order, open Track order and enter this ID with the mobile number
          you ordered with.
        </p>
      )}
    </section>
  )
}
