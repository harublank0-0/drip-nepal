import { Link } from '@adonisjs/inertia/react'
import { PackageIcon, ShoppingBagIcon } from 'lucide-react'
import { Button } from '~/components/ui/button'

export function EmptyCart() {
  return (
    <div className="flex flex-col items-center px-4 py-16 text-center">
      <div className="mb-6 flex size-16 items-center justify-center rounded-full bg-muted">
        <ShoppingBagIcon className="size-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="font-heading text-2xl font-semibold">Your cart is empty</h1>
      <p className="mt-2 max-w-xs text-sm text-muted-foreground">
        Find something you like from Nepal&apos;s independent shops and it will show up here.
      </p>
      <div className="mt-8 flex w-full max-w-xs flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
        <Button size="lg" className="h-11 rounded-xl px-6" asChild>
          <Link route="home">Start shopping</Link>
        </Button>
        <Button size="lg" variant="outline" className="h-11 rounded-xl px-6" asChild>
          <Link route="account.orders.index">
            <PackageIcon className="size-4" aria-hidden="true" />
            My orders
          </Link>
        </Button>
      </div>
    </div>
  )
}
