import { useState } from 'react'
import { router } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { MailIcon, MapPinIcon, PhoneIcon, StoreIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import { AdminLayout } from '~/layouts/admin_layout'
import { Button } from '~/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Pager } from '~/components/dashboard/pager'
import { formatDate } from '~/lib/format'
import { cn } from '~/lib/utils'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'

type PageProps = InertiaProps<{
  /*
   * Not `shops`: that name is taken by the shared prop with the user's own shops.
   */
  adminShops: Paginated<Data.AdminShop>
  filters: { status: string }
  counts: Record<string, number>
}>

const TABS = [
  { value: 'pending', label: 'Waiting for approval' },
  { value: 'active', label: 'Live' },
  { value: 'suspended', label: 'Suspended' },
]

export default function AdminShopsPage({ adminShops: shops, filters, counts }: PageProps) {
  const [suspending, setSuspending] = useState<Data.AdminShop | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const setStatus = (shop: Data.AdminShop, status: 'active' | 'suspended') => {
    router.post(
      `/api/v1/admin/shops/${shop.id}/status`,
      { status },
      {
        preserveScroll: true,
        onStart: () => setProcessingId(shop.id),
        onFinish: () => {
          setProcessingId(null)
          setSuspending(null)
        },
      }
    )
  }

  const listUrl = (status: string, page?: number) =>
    `/admin/shops?status=${status}${page && page > 1 ? `&page=${page}` : ''}`

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Shops</h1>
        <p className="text-sm text-muted-foreground">
          Approve new shops to put their products on Drip Nepal. Suspending a shop hides it and its
          products from the storefront.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto rounded-lg border p-1" role="tablist">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={listUrl(tab.value)}
            role="tab"
            aria-selected={filters.status === tab.value}
            className={cn(
              'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm',
              filters.status === tab.value
                ? 'bg-muted font-medium'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">
              {counts[tab.value] ?? 0}
            </span>
          </Link>
        ))}
      </div>

      {shops.data.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <StoreIcon className="mb-3 size-10 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            {filters.status === 'pending' ? 'No shops waiting for approval.' : 'No shops here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {shops.data.map((shop) => (
            <li key={shop.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-medium">{shop.name}</h2>
                    <span className="text-xs text-muted-foreground">/{shop.slug}</span>
                  </div>
                  {shop.description && (
                    <p className="max-w-2xl text-sm text-muted-foreground">{shop.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs text-muted-foreground">
                    {shop.location && (
                      <span className="flex items-center gap-1">
                        <MapPinIcon className="size-3.5" />
                        {shop.location}
                      </span>
                    )}
                    {shop.email && (
                      <span className="flex items-center gap-1">
                        <MailIcon className="size-3.5" />
                        {shop.email}
                      </span>
                    )}
                    {shop.phone && (
                      <span className="flex items-center gap-1">
                        <PhoneIcon className="size-3.5" />
                        {shop.phone}
                      </span>
                    )}
                    <span>
                      {shop.productCount} {shop.productCount === 1 ? 'product' : 'products'}
                    </span>
                    <span>Registered {formatDate(shop.createdAt)}</span>
                  </div>
                  {shop.owner && (
                    <p className="text-xs text-muted-foreground">
                      Owner: {shop.owner.fullName} · {shop.owner.email}
                      {shop.owner.phone ? ` · ${shop.owner.phone}` : ''}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {shop.status === 'active' && (
                    <Button variant="ghost" asChild>
                      <Link route="stores.show" routeParams={{ slug: shop.slug }}>
                        View shop
                      </Link>
                    </Button>
                  )}
                  {shop.status !== 'suspended' && (
                    <Button
                      variant="outline"
                      onClick={() => setSuspending(shop)}
                      disabled={processingId === shop.id}
                    >
                      {shop.status === 'pending' ? 'Reject' : 'Suspend'}
                    </Button>
                  )}
                  {shop.status !== 'active' && (
                    <Button
                      onClick={() => setStatus(shop, 'active')}
                      disabled={processingId === shop.id}
                    >
                      {shop.status === 'pending' ? 'Approve' : 'Reactivate'}
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager meta={shops.metadata} hrefFor={(page) => listUrl(filters.status, page)} />

      <Dialog open={suspending !== null} onOpenChange={(open) => !open && setSuspending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {suspending?.status === 'pending' ? 'Reject' : 'Suspend'} {suspending?.name}?
            </DialogTitle>
            <DialogDescription>
              The shop and its products won&apos;t appear on the storefront. The owner can still
              sign in, and you can reactivate the shop later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspending(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => suspending && setStatus(suspending, 'suspended')}
              disabled={processingId !== null}
            >
              {suspending?.status === 'pending' ? 'Reject shop' : 'Suspend shop'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

AdminShopsPage.layout = [RootLayout, AdminLayout]
