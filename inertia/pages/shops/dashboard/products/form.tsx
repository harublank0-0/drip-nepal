import { useEffect, useMemo, useRef, type SubmitEvent } from 'react'
import { useForm, usePage } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import { ArrowLeftIcon, ImagePlusIcon, PlusIcon, Trash2Icon, XIcon } from 'lucide-react'
import type { Data } from '@generated/data'
import { minorToRupeesText, parseRupeesToMinor } from '@shared/format/money'
import { PRICE_MAX_MINOR, PRICE_MESSAGES } from '@shared/constants/money'
import RootLayout from '~/layouts/root_layout'
import { ShopDashboardLayout } from '~/layouts/shop_dashboard_layout'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Label } from '~/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { cn } from '~/lib/utils'
import type { InertiaProps } from '~/types'

type PageProps = InertiaProps<{
  product: Data.Product | null
  categories: Data.Category[]
}>

type VariantRow = {
  id?: string
  size: string
  color: string
  sku: string
  // Rupees as typed; sent as paisa (`priceMinor`, docs/04 §18.1).
  price: string
  comparePrice: string
  quantity: string
  // The stock the form showed for an existing variant (docs/05 §5.9).
  expectedQuantity?: string
}

type ProductFormData = {
  name: string
  description: string
  categoryId: string
  gender: string
  brand: string
  status: string
  variants: VariantRow[]
  keepMediaIds: string[]
  images: File[]
}

const MAX_IMAGES = 8

/*
 * Why typed rupees can't be a price, or null when they can: the server's
 * messages, before sending.
 */
function priceProblem(typed: string, minor: number | null) {
  if (typed.trim() === '') return PRICE_MESSAGES.missing
  // More whole rupees than any price has.
  if (/^\d{10,}(\.\d{1,2})?$/.test(typed.trim().replaceAll(',', ''))) return PRICE_MESSAGES.tooHigh
  if (minor === null) return PRICE_MESSAGES.unreadable
  if (minor > PRICE_MAX_MINOR) return PRICE_MESSAGES.tooHigh
  return null
}

const GENDERS = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'unisex', label: 'Unisex' },
]

const emptyVariant = (): VariantRow => ({
  size: '',
  color: '',
  sku: '',
  price: '',
  comparePrice: '',
  quantity: '0',
})

function toVariantRow(variant: Data.ProductVariant): VariantRow {
  return {
    id: variant.id,
    size: variant.size ?? '',
    color: variant.color ?? '',
    sku: variant.sku,
    price: minorToRupeesText(variant.priceMinor),
    comparePrice:
      variant.comparePriceMinor === null ? '' : minorToRupeesText(variant.comparePriceMinor),
    quantity: String(variant.quantity),
    expectedQuantity: String(variant.quantity),
  }
}

function FieldMessage({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-xs text-destructive">{message}</p>
}

export default function ShopProductFormPage({ product, categories }: PageProps) {
  const { currentShop } = usePage<Data.SharedProps>().props
  const base = `/shops/${currentShop?.slug}`
  const isEditing = product !== null
  const fileInput = useRef<HTMLInputElement>(null)

  const form = useForm<ProductFormData>({
    name: product?.name ?? '',
    description: product?.description ?? '',
    categoryId: product?.categoryId ?? '',
    gender: product?.gender ?? 'unisex',
    brand: product?.brand ?? '',
    status: product?.status === 'active' ? 'active' : 'draft',
    variants: product?.variants?.length ? product.variants.map(toVariantRow) : [emptyVariant()],
    keepMediaIds: (product?.media ?? []).map((media) => media.id),
    images: [],
  })

  const errors = form.errors as Record<string, string | undefined>

  /*
   * Customers can buy while this form is open. When fresh page data comes
   * back (a save the server refused, for example), a stock number the
   * seller didn't touch takes the current stock, so the form never sends
   * an old number back. A number the server refused because the stock
   * changed keeps what the seller typed, and the stock they were just told
   * becomes the one the form showed, so saving again applies it. Inertia
   * sets the errors after the new page data, so this runs on both.
   */
  const shownProduct = useRef(product)
  useEffect(() => {
    if (!product) return
    const productChanged = product !== shownProduct.current
    shownProduct.current = product
    const current = new Map(
      (product.variants ?? []).map((variant) => [variant.id, String(variant.quantity)])
    )
    let changed = false
    const variants = form.data.variants.map((row, index) => {
      const stock = row.id ? current.get(row.id) : undefined
      if (stock === undefined) return row
      if (productChanged && row.quantity === row.expectedQuantity && row.quantity !== stock) {
        changed = true
        return { ...row, quantity: stock, expectedQuantity: stock }
      }
      const refused = errors[`variants.${index}.expectedQuantity`]
      if (refused && row.expectedQuantity !== stock) {
        changed = true
        return { ...row, expectedQuantity: stock }
      }
      return row
    })
    if (changed) form.setData('variants', variants)
  }, [product, errors, form])

  const keptMedia = useMemo(
    () =>
      form.data.keepMediaIds
        .map((id) => product?.media?.find((media) => media.id === id))
        .filter((media): media is Data.ProductMedia => Boolean(media)),
    [form.data.keepMediaIds, product]
  )

  const newImagePreviews = useMemo(
    () => form.data.images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [form.data.images]
  )

  useEffect(() => {
    return () => newImagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
  }, [newImagePreviews])

  const imageCount = keptMedia.length + form.data.images.length
  const imageErrors = Object.entries(errors)
    .filter(
      ([key]) => key === 'images' || key.startsWith('images.') || key.startsWith('keepMediaIds')
    )
    .map(([, message]) => message)

  const addFiles = (files: FileList | null) => {
    if (!files) return
    const room = MAX_IMAGES - imageCount
    form.setData('images', [...form.data.images, ...Array.from(files).slice(0, room)])
    if (fileInput.current) fileInput.current.value = ''
  }

  const updateVariant = (index: number, field: keyof VariantRow, value: string) => {
    form.setData(
      'variants',
      form.data.variants.map((variant, i) =>
        i === index ? { ...variant, [field]: value } : variant
      )
    )
  }

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    const url = isEditing
      ? `/api/v1/shops/${currentShop?.slug}/products/${product.id}`
      : `/api/v1/shops/${currentShop?.slug}/products`

    // Prices go as whole paisa, converted from the rupees typed without a
    // float (docs/04 §18.1). One that can't be read is refused here.
    const unreadable: Record<string, string> = {}
    const rows = form.data.variants.map((row, index) => {
      const priceMinor = parseRupeesToMinor(row.price)
      const comparePriceMinor =
        row.comparePrice.trim() === '' ? null : parseRupeesToMinor(row.comparePrice)
      const priceRefused = priceProblem(row.price, priceMinor)
      if (priceRefused) unreadable[`variants.${index}.priceMinor`] = priceRefused
      const compareRefused =
        row.comparePrice.trim() === '' ? null : priceProblem(row.comparePrice, comparePriceMinor)
      if (compareRefused) unreadable[`variants.${index}.comparePriceMinor`] = compareRefused
      const { price, comparePrice, ...rest } = row
      return { ...rest, priceMinor, comparePriceMinor: comparePriceMinor ?? '' }
    })
    form.clearErrors()
    if (Object.keys(unreadable).length > 0) {
      form.setError(unreadable as Partial<Record<keyof ProductFormData, string>>)
      return
    }

    form.transform((data) => ({ ...data, variants: rows }))
    form.post(url, { forceFormData: true, preserveScroll: true })
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon-sm" asChild>
            <Link href={`${base}/products`} aria-label="Back to products">
              <ArrowLeftIcon className="size-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isEditing ? product.name : 'Add product'}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" type="button" asChild>
            <Link href={`${base}/products`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={form.processing}>
            {form.processing ? 'Saving…' : isEditing ? 'Save changes' : 'Save product'}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="space-y-4 rounded-xl border p-5">
            <h2 className="font-medium">Details</h2>
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.data.name}
                onChange={(event) => form.setData('name', event.target.value)}
                placeholder="Oversized cotton hoodie"
                maxLength={100}
                aria-invalid={Boolean(errors.name)}
              />
              <FieldMessage message={errors.name} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.data.description}
                onChange={(event) => form.setData('description', event.target.value)}
                placeholder="Fabric, fit, care instructions…"
                rows={6}
                maxLength={5000}
                aria-invalid={Boolean(errors.description)}
              />
              <FieldMessage message={errors.description} />
            </div>
          </section>

          <section className="space-y-4 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-medium">Photos</h2>
              <span className="text-xs text-muted-foreground">
                {imageCount}/{MAX_IMAGES} · the first photo is the cover
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {keptMedia.map((media) => (
                <div
                  key={media.id}
                  className="group relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  <img
                    src={media.thumbnailUrl ?? media.url}
                    alt={media.altText ?? ''}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      form.setData(
                        'keepMediaIds',
                        form.data.keepMediaIds.filter((id) => id !== media.id)
                      )
                    }
                    className="absolute top-1.5 right-1.5 rounded-full bg-background/90 p-1 shadow-sm"
                    aria-label="Remove photo"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
              {newImagePreviews.map((preview, index) => (
                <div
                  key={preview.url}
                  className="relative aspect-square overflow-hidden rounded-lg border bg-muted"
                >
                  <img
                    src={preview.url}
                    alt={preview.file.name}
                    className="size-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      form.setData(
                        'images',
                        form.data.images.filter((_, i) => i !== index)
                      )
                    }
                    className="absolute top-1.5 right-1.5 rounded-full bg-background/90 p-1 shadow-sm"
                    aria-label="Remove photo"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              ))}
              {imageCount < MAX_IMAGES && (
                <button
                  type="button"
                  onClick={() => fileInput.current?.click()}
                  className="flex aspect-square flex-col items-center justify-center gap-1 rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
                >
                  <ImagePlusIcon className="size-5" />
                  <span className="text-xs">Add photos</span>
                </button>
              )}
            </div>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => addFiles(event.target.files)}
            />
            <p className="text-xs text-muted-foreground">JPG, PNG or WebP, up to 5 MB each.</p>
            {imageErrors.map((message, index) => (
              <FieldMessage key={index} message={message} />
            ))}
          </section>

          <section className="space-y-4 rounded-xl border p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-medium">Variants</h2>
                <p className="text-xs text-muted-foreground">
                  One row per size/color you sell. Leave size and color empty if there&apos;s only
                  one.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => form.setData('variants', [...form.data.variants, emptyVariant()])}
              >
                <PlusIcon className="size-4" />
                Add variant
              </Button>
            </div>
            <FieldMessage message={errors.variants} />
            <div className="space-y-3">
              {form.data.variants.map((variant, index) => {
                const error = (field: string) => errors[`variants.${index}.${field}`]
                return (
                  <div key={variant.id ?? `new-${index}`} className="rounded-lg border p-3">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
                      <div className="space-y-1">
                        <Label className="text-xs">Size</Label>
                        <Input
                          value={variant.size}
                          onChange={(event) => updateVariant(index, 'size', event.target.value)}
                          placeholder="M"
                          maxLength={30}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Color</Label>
                        <Input
                          value={variant.color}
                          onChange={(event) => updateVariant(index, 'color', event.target.value)}
                          placeholder="Black"
                          maxLength={30}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price (Rs)</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={variant.price}
                          onChange={(event) => updateVariant(index, 'price', event.target.value)}
                          placeholder="2500"
                          aria-invalid={Boolean(error('priceMinor'))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Compare-at</Label>
                        <Input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={variant.comparePrice}
                          onChange={(event) =>
                            updateVariant(index, 'comparePrice', event.target.value)
                          }
                          placeholder="Optional"
                          aria-invalid={Boolean(error('comparePriceMinor'))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Stock</Label>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min="0"
                          step="1"
                          value={variant.quantity}
                          onChange={(event) => updateVariant(index, 'quantity', event.target.value)}
                          aria-invalid={Boolean(error('quantity') || error('expectedQuantity'))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">SKU</Label>
                        <div className="flex gap-1">
                          <Input
                            value={variant.sku}
                            onChange={(event) => updateVariant(index, 'sku', event.target.value)}
                            placeholder="Auto"
                            maxLength={100}
                            aria-invalid={Boolean(error('sku'))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className={cn(form.data.variants.length === 1 && 'invisible')}
                            onClick={() =>
                              form.setData(
                                'variants',
                                form.data.variants.filter((_, i) => i !== index)
                              )
                            }
                            aria-label="Remove variant"
                          >
                            <Trash2Icon className="size-4 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                    {[
                      'size',
                      'color',
                      'priceMinor',
                      'comparePriceMinor',
                      'quantity',
                      'expectedQuantity',
                      'sku',
                      'id',
                    ].map((field) => (
                      <FieldMessage key={field} message={error(field)} />
                    ))}
                  </div>
                )
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="space-y-3 rounded-xl border p-5">
            <h2 className="font-medium">Visibility</h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Status">
              {[
                { value: 'draft', label: 'Draft', hint: 'Only you see it' },
                { value: 'active', label: 'Active', hint: 'Listed for sale' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={form.data.status === option.value}
                  onClick={() => form.setData('status', option.value)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors',
                    form.data.status === option.value
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-muted/40'
                  )}
                >
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </button>
              ))}
            </div>
            {currentShop?.status !== 'active' && (
              <p className="text-xs text-muted-foreground">
                Your shop is awaiting approval. Active products go live once it&apos;s approved.
              </p>
            )}
          </section>

          <section className="space-y-4 rounded-xl border p-5">
            <h2 className="font-medium">Organization</h2>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.data.categoryId || undefined}
                onValueChange={(value) => form.setData('categoryId', value)}
              >
                <SelectTrigger className="w-full" aria-invalid={Boolean(errors.categoryId)}>
                  <SelectValue placeholder="Choose a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage message={errors.categoryId} />
            </div>
            <div className="space-y-1.5">
              <Label>For</Label>
              <Select
                value={form.data.gender}
                onValueChange={(value) => form.setData('gender', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GENDERS.map((gender) => (
                    <SelectItem key={gender.value} value={gender.value}>
                      {gender.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldMessage message={errors.gender} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="brand">Brand</Label>
              <Input
                id="brand"
                value={form.data.brand}
                onChange={(event) => form.setData('brand', event.target.value)}
                placeholder="Optional"
                maxLength={100}
              />
              <FieldMessage message={errors.brand} />
            </div>
          </section>
        </div>
      </div>
    </form>
  )
}

ShopProductFormPage.layout = [RootLayout, ShopDashboardLayout]
