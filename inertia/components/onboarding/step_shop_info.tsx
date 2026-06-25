import { Loader2Icon, InfoIcon, UploadIcon } from 'lucide-react'
import type { ReactFormApi } from '@tanstack/react-form'
import { Field, FieldError, FieldLabel, FieldDescription } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { Button } from '~/components/ui/button'
import { Show } from '~/components/ui/show'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { SlugInput, generateSlug } from '~/components/onboarding/slug_input'
import { cn } from '~/lib/utils'

const shopCategories = [
  'Fashion & Apparel',
  'Electronics & Gadgets',
  'Home & Living',
  'Beauty & Personal Care',
  'Food & Beverages',
  'Sports & Outdoors',
  'Books & Stationery',
  'Handicrafts & Art',
  'Health & Wellness',
  'Jewelry & Accessories',
  'Baby & Kids',
  'Pet Supplies',
  'Other',
]

const nepalProvinces = [
  'Koshi Province',
  'Madhesh Province',
  'Bagmati Province',
  'Gandaki Province',
  'Lumbini Province',
  'Karnali Province',
  'Sudurpashchim Province',
]

type StepShopInfoProps = {
  form: ReactFormApi<any, any, any, any, any, any, any, any, any, any>
  isSubmitting: boolean
  onSubmit: () => void
  onBack: () => void
}

export function StepShopInfo({ form, isSubmitting, onSubmit, onBack }: StepShopInfoProps) {
  return (
    <div className="space-y-6">
      <form.Field name="shopName" mode="blur">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="shopName">Shop Name</FieldLabel>
              <Input
                id="shopName"
                type="text"
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(e) => {
                  field.handleChange(e.target.value)
                  form.setFieldValue('shopSlug' as any, generateSlug(e.target.value))
                }}
                placeholder="My Awesome Shop"
                autoComplete="off"
                aria-invalid={isInvalid}
              />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="shopSlug" mode="blur">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          const shopName = form.getFieldValue('shopName')
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="shopSlug">Shop URL</FieldLabel>
              <FieldDescription>
                This is your shop&apos;s unique URL on Drip Nepal.
              </FieldDescription>
              <SlugInput
                value={field.state.value || ''}
                onChange={field.handleChange}
                onBlur={field.handleBlur}
                isInvalid={isInvalid}
                error={isInvalid ? (field.state.meta.errors?.[0]?.message ?? '') : undefined}
                shopName={shopName || ''}
              />
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="category" mode="blur">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="category">Shop Category</FieldLabel>
              <Select
                value={field.state.value || ''}
                onValueChange={(value) => field.handleChange(value)}
              >
                <SelectTrigger
                  id="category"
                  className={cn(
                    'w-full',
                    isInvalid &&
                      'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
                  )}
                  aria-invalid={isInvalid}
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {shopCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <form.Field name="description" mode="blur">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor="description">Description</FieldLabel>
              <FieldDescription>Tell customers about your shop and what you sell.</FieldDescription>
              <Textarea
                id="description"
                value={field.state.value || ''}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="We sell high-quality clothing made in Nepal..."
                rows={3}
                aria-invalid={isInvalid}
              />
              <Show when={isInvalid}>
                <FieldError errors={field.state.meta.errors} />
              </Show>
            </Field>
          )
        }}
      </form.Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <form.Field name="address" mode="blur">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field className="sm:col-span-2" data-invalid={isInvalid}>
                <FieldLabel htmlFor="address">Address</FieldLabel>
                <Input
                  id="address"
                  type="text"
                  value={field.state.value || ''}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Street, ward number, landmark"
                  autoComplete="street-address"
                  aria-invalid={isInvalid}
                />
                <Show when={isInvalid}>
                  <FieldError errors={field.state.meta.errors} />
                </Show>
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="city" mode="blur">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="city">City</FieldLabel>
                <Input
                  id="city"
                  type="text"
                  value={field.state.value || ''}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Kathmandu"
                  autoComplete="address-level2"
                  aria-invalid={isInvalid}
                />
                <Show when={isInvalid}>
                  <FieldError errors={field.state.meta.errors} />
                </Show>
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="district" mode="blur">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field data-invalid={isInvalid}>
                <FieldLabel htmlFor="district">District</FieldLabel>
                <Input
                  id="district"
                  type="text"
                  value={field.state.value || ''}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Lalitpur"
                  autoComplete="address-level1"
                  aria-invalid={isInvalid}
                />
                <Show when={isInvalid}>
                  <FieldError errors={field.state.meta.errors} />
                </Show>
              </Field>
            )
          }}
        </form.Field>

        <form.Field name="province" mode="blur">
          {(field) => {
            const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid
            return (
              <Field className="sm:col-span-2" data-invalid={isInvalid}>
                <FieldLabel htmlFor="province">Province</FieldLabel>
                <Select
                  value={field.state.value || ''}
                  onValueChange={(value) => field.handleChange(value)}
                >
                  <SelectTrigger
                    id="province"
                    className={cn(
                      'w-full',
                      isInvalid &&
                        'border-destructive ring-3 ring-destructive/20 dark:ring-destructive/40'
                    )}
                    aria-invalid={isInvalid}
                  >
                    <SelectValue placeholder="Select province" />
                  </SelectTrigger>
                  <SelectContent>
                    {nepalProvinces.map((prov) => (
                      <SelectItem key={prov} value={prov}>
                        {prov}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Show when={isInvalid}>
                  <FieldError errors={field.state.meta.errors} />
                </Show>
              </Field>
            )
          }}
        </form.Field>
      </div>

      <form.Field name="logo">
        {(field) => (
          <Field>
            <FieldLabel htmlFor="logo">Shop Logo</FieldLabel>
            <FieldDescription>Optional. Upload a square image for best results.</FieldDescription>
            <label
              htmlFor="logo"
              className={cn(
                'flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-input bg-transparent px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-primary hover:text-primary',
                field.state.value && 'border-primary text-primary'
              )}
            >
              <UploadIcon className="size-4" />
              {field.state.value ? (field.state.value as File).name : 'Upload logo (optional)'}
            </label>
            <input
              id="logo"
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) field.handleChange(file as any)
              }}
            />
          </Field>
        )}
      </form.Field>

      {/* info card */}
      <div className="flex items-start gap-3 rounded-lg bg-muted/50 p-4 ring-1 ring-foreground/5">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-sm text-muted-foreground">
          <p className="font-medium text-foreground">You can add more details later</p>
          <p className="mt-0.5">
            PAN number, bank details, business verification documents, and additional information
            can be added from your shop dashboard after registration.
          </p>
        </div>
      </div>

      {/* action buttons */}
      <div className="flex gap-3">
        <Button type="button" variant="outline" size="lg" onClick={onBack} className="flex-1">
          Back
        </Button>
        <Button
          type="button"
          size="lg"
          className="flex-1"
          onClick={onSubmit}
          disabled={isSubmitting}
        >
          <Show when={isSubmitting}>
            <Loader2Icon className="size-4 animate-spin" />
          </Show>
          Create Shop
        </Button>
      </div>
    </div>
  )
}
