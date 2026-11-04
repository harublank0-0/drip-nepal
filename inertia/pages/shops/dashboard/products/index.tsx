import { useState, type SubmitEvent } from 'react'
import { router, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ImageIcon, PencilIcon, PlusIcon, SearchIcon, Trash2Icon } from 'lucide-react'
import type { Data } from '@generated/data'
import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Badge } from '~/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '~/components/ui/dialog'
import { Pager } from '~/components/dashboard/pager'
import { formatPrice } from '~/lib/format'
import type { InertiaProps } from '~/types'
import type { Paginated } from '~/types/pagination'

type PageProps = InertiaProps<{
  products: Paginated<Data.Product>
  filters: { search: string; status: string }
}>

const STATUS_FILTERS = [
  { value: '', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
]

function priceRange(variants: Data.ProductVariant[]) {
  if (variants.length === 0) return '—'
  const prices = variants.map((variant) => variant.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? formatPrice(min) : `${formatPrice(min)} – ${formatPrice(max)}`
}

export default function ShopProductsPage({ products, filters }: PageProps) {
  const { currentShop } = usePage<Data.SharedProps>().props
  const base = `/shops/${currentShop?.slug}`
  const [search, setSearch] = useState(filters.search)
  const [deleting, setDeleting] = useState<Data.Product | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)

  const listUrl = (params: { search?: string; status?: string; page?: number }) => {
    const query = new URLSearchParams()
    const nextSearch = params.search ?? filters.search
    const nextStatus = params.status ?? filters.status
    if (nextSearch) query.set('search', nextSearch)
    if (nextStatus) query.set('status', nextStatus)
    if (params.page && params.page > 1) query.set('page', String(params.page))
    const qs = query.toString()
    return `${base}/products${qs ? `?${qs}` : ''}`
  }

  const submitSearch = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    router.visit(listUrl({ search, page: 1 }), { preserveState: true })
  }

  const confirmDelete = () => {
    if (!deleting) return
    router.delete(`/api/v1/shops/${currentShop?.slug}/products/${deleting.id}`, {
      preserveScroll: true,
      onStart: () => setDeleteInProgress(true),
      onFinish: () => {
        setDeleteInProgress(false)
        setDeleting(null)
      },
    })
  }

  const hasFilters = Boolean(filters.search || filters.status)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-muted-foreground">
            Add what you sell. Active products appear on Drip Nepal once your shop is approved.
          </p>
        </div>
        <Button asChild>
          <Link href={`${base}/products/create`}>
            <PlusIcon className="size-4" />
            Add product
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={submitSearch} className="relative w-full max-w-xs">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search products"
            className="pl-8"
            aria-label="Search products"
          />
        </form>
        <div className="flex gap-1 rounded-lg border p-1" role="tablist" aria-label="Status">
          {STATUS_FILTERS.map((option) => (
            <Link
              key={option.value}
              href={listUrl({ status: option.value, page: 1 })}
              preserveState
              role="tab"
              aria-selected={filters.status === option.value}
              className={
                filters.status === option.value
                  ? 'rounded-md bg-muted px-3 py-1 text-sm font-medium'
                  : 'rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground'
              }
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      {products.data.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
          <ImageIcon className="mb-3 size-10 text-muted-foreground/50" />
          <h2 className="font-medium">{hasFilters ? 'No products match' : 'No products yet'}</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {hasFilters
              ? 'Try a different search or status.'
              : 'Add your first product with photos, sizes, colors and stock.'}
          </p>
          {!hasFilters && (
            <Button className="mt-4" asChild>
              <Link href={`${base}/products/create`}>
                <PlusIcon className="size-4" />
                Add product
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="relative overflow-x-auto rounded-xl border">
          {/* relative: makes this box the containing block of absolutely positioned
              children such as sr-only labels, so they can't escape it and widen the page */}
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Price</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {products.data.map((product) => {
                const variants = product.variants ?? []
                const stock = variants.reduce((sum, variant) => sum + variant.quantity, 0)
                const cover = product.media?.[0]

                return (
                  <tr key={product.id} className="hover:bg-muted/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                          {cover ? (
                            <img
                              src={cover.url}
                              alt={cover.altText ?? product.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <ImageIcon className="size-5 text-muted-foreground/60" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <Link
                            href={`${base}/products/${product.id}/edit`}
                            className="block truncate font-medium hover:underline"
                          >
                            {product.name}
                          </Link>
                          <span className="text-xs text-muted-foreground">
                            {product.category?.name} · {variants.length}{' '}
                            {variants.length === 1 ? 'variant' : 'variants'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={product.status === 'active' ? 'default' : 'secondary'}>
                        {product.status === 'active' ? 'Active' : 'Draft'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">{priceRange(variants)}</td>
                    <td className="px-4 py-3">
                      <span className={stock === 0 ? 'font-medium text-destructive' : undefined}>
                        {stock === 0 ? 'Out of stock' : stock}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon-sm" asChild>
                          <Link
                            href={`${base}/products/${product.id}/edit`}
                            aria-label={`Edit ${product.name}`}
                          >
                            <PencilIcon className="size-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${product.name}`}
                          onClick={() => setDeleting(product)}
                        >
                          <Trash2Icon className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pager meta={products.metadata} hrefFor={(page) => listUrl({ page })} />

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              It will be removed from your shop and the storefront. Past orders keep their record of
              it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={deleteInProgress}>
              {deleteInProgress ? 'Deleting…' : 'Delete product'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

ShopProductsPage.layout = [RootLayout, ShopDashboardLayout]
