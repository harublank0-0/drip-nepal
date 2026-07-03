import { BuildingIcon } from 'lucide-react'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Separator } from '~/components/ui/separator'
import { dripSlugify } from '~/lib/utils'
import { SectionCard } from '../components/section-card'
import { AutoSaveIndicator } from '../components/auto-save-indicator'
import { useSectionForm } from '../hooks/use-section-form'
import { shopInformationSchema, type ShopInformation } from '../types'
import {
  businessCategoryOptions,
  countryOptions,
  currencyOptions,
  languageOptions,
  timezoneOptions,
} from '../constants'

type ShopInformationFormProps = {
  value: ShopInformation
  onChange: (next: ShopInformation) => void
}

export function ShopInformationForm({ value, onChange }: ShopInformationFormProps) {
  const { errors, setField, handleBlur, isInvalid } = useSectionForm(
    value,
    onChange,
    shopInformationSchema
  )

  return (
    <SectionCard
      icon={BuildingIcon}
      title="Shop Information"
      description="Core details customers and partners see about your business."
      action={<AutoSaveIndicator status="idle" />}
    >
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={isInvalid('storeName')}>
            <FieldLabel htmlFor="storeName">Store Name</FieldLabel>
            <Input
              id="storeName"
              value={value.storeName}
              onBlur={() => handleBlur('storeName')}
              onChange={(event) => {
                setField('storeName', event.target.value)
              }}
              aria-invalid={isInvalid('storeName')}
            />
            <FieldError>{isInvalid('storeName') ? errors.storeName : undefined}</FieldError>
          </Field>

          <Field data-invalid={isInvalid('storeSlug')}>
            <FieldLabel htmlFor="storeSlug">Store Slug</FieldLabel>
            <div className="flex items-center gap-1.5 rounded-lg border border-input bg-transparent pl-2.5 text-sm text-muted-foreground focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
              <span className="shrink-0">drip-nepal.com/</span>
              <input
                id="storeSlug"
                value={value.storeSlug}
                onBlur={() => handleBlur('storeSlug')}
                onChange={(event) => setField('storeSlug', dripSlugify(event.target.value))}
                aria-invalid={isInvalid('storeSlug')}
                className="h-8 w-full min-w-0 bg-transparent py-1 pr-2.5 text-base text-foreground outline-none md:text-sm"
              />
            </div>
            <FieldError>{isInvalid('storeSlug') ? errors.storeSlug : undefined}</FieldError>
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="tagline">Short Tagline</FieldLabel>
          <Input
            id="tagline"
            value={value.tagline ?? ''}
            onChange={(event) => setField('tagline', event.target.value)}
            placeholder="Wear the city. Move the culture."
          />
          <FieldError>{isInvalid('tagline') ? errors.tagline : undefined}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="businessDescription">Business Description</FieldLabel>
          <Textarea
            id="businessDescription"
            rows={4}
            value={value.businessDescription ?? ''}
            onChange={(event) => setField('businessDescription', event.target.value)}
            aria-invalid={isInvalid('businessDescription')}
          />
          <div className="flex items-center justify-between">
            <FieldError>
              {isInvalid('businessDescription') ? errors.businessDescription : undefined}
            </FieldError>
            <span className="text-xs text-muted-foreground">
              {(value.businessDescription ?? '').length}/1000
            </span>
          </div>
        </Field>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={isInvalid('supportEmail')}>
            <FieldLabel htmlFor="supportEmail">Support Email</FieldLabel>
            <Input
              id="supportEmail"
              type="email"
              value={value.supportEmail}
              onBlur={() => handleBlur('supportEmail')}
              onChange={(event) => setField('supportEmail', event.target.value)}
              aria-invalid={isInvalid('supportEmail')}
            />
            <FieldError>{isInvalid('supportEmail') ? errors.supportEmail : undefined}</FieldError>
          </Field>

          <Field data-invalid={isInvalid('phoneNumber')}>
            <FieldLabel htmlFor="phoneNumber">Phone Number</FieldLabel>
            <Input
              id="phoneNumber"
              value={value.phoneNumber}
              onBlur={() => handleBlur('phoneNumber')}
              onChange={(event) => setField('phoneNumber', event.target.value)}
              aria-invalid={isInvalid('phoneNumber')}
            />
            <FieldError>{isInvalid('phoneNumber') ? errors.phoneNumber : undefined}</FieldError>
          </Field>

          <Field data-invalid={isInvalid('website')}>
            <FieldLabel htmlFor="website">Website</FieldLabel>
            <Input
              id="website"
              value={value.website ?? ''}
              onBlur={() => handleBlur('website')}
              onChange={(event) => setField('website', event.target.value)}
              placeholder="https://"
              aria-invalid={isInvalid('website')}
            />
            <FieldError>{isInvalid('website') ? errors.website : undefined}</FieldError>
          </Field>

          <Field>
            <FieldLabel htmlFor="businessCategory">Business Category</FieldLabel>
            <Select
              value={value.businessCategory}
              onValueChange={(next) => setField('businessCategory', next)}
            >
              <SelectTrigger id="businessCategory" className="w-full">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                {businessCategoryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="businessRegistrationNumber">
              Business Registration Number
            </FieldLabel>
            <Input
              id="businessRegistrationNumber"
              value={value.businessRegistrationNumber ?? ''}
              onChange={(event) => setField('businessRegistrationNumber', event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="taxId">Tax ID</FieldLabel>
            <Input
              id="taxId"
              value={value.taxId ?? ''}
              onChange={(event) => setField('taxId', event.target.value)}
            />
          </Field>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="country">Country</FieldLabel>
            <Select value={value.country} onValueChange={(next) => setField('country', next)}>
              <SelectTrigger id="country" className="w-full">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent>
                {countryOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={isInvalid('state')}>
            <FieldLabel htmlFor="state">State / Province</FieldLabel>
            <Input
              id="state"
              value={value.state}
              onBlur={() => handleBlur('state')}
              onChange={(event) => setField('state', event.target.value)}
              aria-invalid={isInvalid('state')}
            />
            <FieldError>{isInvalid('state') ? errors.state : undefined}</FieldError>
          </Field>

          <Field data-invalid={isInvalid('city')}>
            <FieldLabel htmlFor="city">City</FieldLabel>
            <Input
              id="city"
              value={value.city}
              onBlur={() => handleBlur('city')}
              onChange={(event) => setField('city', event.target.value)}
              aria-invalid={isInvalid('city')}
            />
            <FieldError>{isInvalid('city') ? errors.city : undefined}</FieldError>
          </Field>

          <Field data-invalid={isInvalid('postalCode')}>
            <FieldLabel htmlFor="postalCode">Postal Code</FieldLabel>
            <Input
              id="postalCode"
              value={value.postalCode}
              onBlur={() => handleBlur('postalCode')}
              onChange={(event) => setField('postalCode', event.target.value)}
              aria-invalid={isInvalid('postalCode')}
            />
            <FieldError>{isInvalid('postalCode') ? errors.postalCode : undefined}</FieldError>
          </Field>

          <Field className="sm:col-span-2" data-invalid={isInvalid('address')}>
            <FieldLabel htmlFor="address">Address</FieldLabel>
            <Input
              id="address"
              value={value.address}
              onBlur={() => handleBlur('address')}
              onChange={(event) => setField('address', event.target.value)}
              aria-invalid={isInvalid('address')}
            />
            <FieldError>{isInvalid('address') ? errors.address : undefined}</FieldError>
          </Field>
        </div>

        <Separator />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="timezone">Timezone</FieldLabel>
            <Select value={value.timezone} onValueChange={(next) => setField('timezone', next)}>
              <SelectTrigger id="timezone" className="w-full">
                <SelectValue placeholder="Select timezone" />
              </SelectTrigger>
              <SelectContent>
                {timezoneOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="currency">Currency</FieldLabel>
            <Select value={value.currency} onValueChange={(next) => setField('currency', next)}>
              <SelectTrigger id="currency" className="w-full">
                <SelectValue placeholder="Select currency" />
              </SelectTrigger>
              <SelectContent>
                {currencyOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="language">Language</FieldLabel>
            <Select value={value.language} onValueChange={(next) => setField('language', next)}>
              <SelectTrigger id="language" className="w-full">
                <SelectValue placeholder="Select language" />
              </SelectTrigger>
              <SelectContent>
                {languageOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <FieldDescription>
          Changes are kept as a draft instantly and applied once you save.
        </FieldDescription>
      </FieldGroup>
    </SectionCard>
  )
}
