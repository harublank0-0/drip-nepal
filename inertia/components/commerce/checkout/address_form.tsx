import { useState } from 'react'
import { motion } from 'framer-motion'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { Checkbox } from '~/components/ui/checkbox'
import { Button } from '~/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { MOCK_PROVINCES, MOCK_DISTRICTS } from '~/lib/mock-data/checkout'
import type { AddressFormData } from '~/types/checkout'

type AddressFormProps = {
  onSubmit: (data: AddressFormData) => void
  onCancel: () => void
  initialData?: Partial<AddressFormData>
}

const initialForm: AddressFormData = {
  fullName: '',
  phoneNumber: '',
  province: '',
  district: '',
  city: '',
  area: '',
  landmark: '',
  postalCode: '',
  label: 'Home',
  isDefault: false,
  saveAddress: true,
}

type FormErrors = Partial<Record<keyof AddressFormData, string>>

const labelOptions = ['Home', 'Office', 'Other']

export function AddressForm({ onSubmit, onCancel, initialData }: AddressFormProps) {
  const [form, setForm] = useState<AddressFormData>({ ...initialForm, ...initialData })
  const [errors, setErrors] = useState<FormErrors>({})
  const [touched, setTouched] = useState<Partial<Record<keyof AddressFormData, boolean>>>({})

  const districts = form.province ? MOCK_DISTRICTS[form.province] || [] : []

  const validate = (): FormErrors => {
    const errs: FormErrors = {}
    if (!form.fullName.trim()) errs.fullName = 'Full name is required'
    if (!form.phoneNumber.trim()) errs.phoneNumber = 'Phone number is required'
    else if (!/^(98|97)\d{8}$/.test(form.phoneNumber.replace(/\s/g, '')))
      errs.phoneNumber = 'Enter a valid Nepali phone number'
    if (!form.province) errs.province = 'Select a province'
    if (!form.district) errs.district = 'Select a district'
    if (!form.city.trim()) errs.city = 'City is required'
    if (!form.area.trim()) errs.area = 'Area / Street is required'
    return errs
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validate()
    setErrors(errs)
    setTouched({
      fullName: true,
      phoneNumber: true,
      province: true,
      district: true,
      city: true,
      area: true,
    })
    if (Object.keys(errs).length === 0) {
      onSubmit(form)
    }
  }

  const set = <K extends keyof AddressFormData>(field: K, value: AddressFormData[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
    if (touched[field]) {
      const newErrors = { ...errors }
      delete newErrors[field]
      setErrors(newErrors)
    }
  }

  const blur = (field: keyof AddressFormData) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const errs = validate()
    if (errs[field]) {
      setErrors((prev) => ({ ...prev, [field]: errs[field] }))
    }
  }

  return (
    <motion.form
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
      onSubmit={handleSubmit}
      className="space-y-4"
    >
      {/* Full Name & Phone */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fullName">Full Name</Label>
          <Input
            id="fullName"
            placeholder="Aarav Sharma"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            onBlur={() => blur('fullName')}
            aria-invalid={!!errors.fullName}
            aria-describedby={errors.fullName ? 'fullName-error' : undefined}
          />
          {errors.fullName && (
            <p id="fullName-error" className="text-xs text-destructive">
              {errors.fullName}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phoneNumber">Phone Number</Label>
          <Input
            id="phoneNumber"
            type="tel"
            placeholder="9841234567"
            value={form.phoneNumber}
            onChange={(e) => set('phoneNumber', e.target.value)}
            onBlur={() => blur('phoneNumber')}
            aria-invalid={!!errors.phoneNumber}
            aria-describedby={errors.phoneNumber ? 'phoneNumber-error' : undefined}
          />
          {errors.phoneNumber && (
            <p id="phoneNumber-error" className="text-xs text-destructive">
              {errors.phoneNumber}
            </p>
          )}
        </div>
      </div>

      {/* Province & District */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="province">Province</Label>
          <Select
            value={form.province}
            onValueChange={(value) => {
              set('province', value)
              set('district', '')
            }}
          >
            <SelectTrigger
              id="province"
              aria-invalid={!!errors.province}
              aria-describedby={errors.province ? 'province-error' : undefined}
            >
              <SelectValue placeholder="Select province" />
            </SelectTrigger>
            <SelectContent>
              {MOCK_PROVINCES.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.province && (
            <p id="province-error" className="text-xs text-destructive">
              {errors.province}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="district">District</Label>
          <Select
            value={form.district}
            onValueChange={(value) => set('district', value)}
            disabled={!form.province}
          >
            <SelectTrigger
              id="district"
              aria-invalid={!!errors.district}
              aria-describedby={errors.district ? 'district-error' : undefined}
            >
              <SelectValue
                placeholder={form.province ? 'Select district' : 'Select province first'}
              />
            </SelectTrigger>
            <SelectContent>
              {districts.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.district && (
            <p id="district-error" className="text-xs text-destructive">
              {errors.district}
            </p>
          )}
        </div>
      </div>

      {/* City */}
      <div className="space-y-1.5">
        <Label htmlFor="city">City / Municipality</Label>
        <Input
          id="city"
          placeholder="Kathmandu"
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          onBlur={() => blur('city')}
          aria-invalid={!!errors.city}
          aria-describedby={errors.city ? 'city-error' : undefined}
        />
        {errors.city && (
          <p id="city-error" className="text-xs text-destructive">
            {errors.city}
          </p>
        )}
      </div>

      {/* Area */}
      <div className="space-y-1.5">
        <Label htmlFor="area">Area / Street</Label>
        <Input
          id="area"
          placeholder="Thamel, Chhetrapati"
          value={form.area}
          onChange={(e) => set('area', e.target.value)}
          onBlur={() => blur('area')}
          aria-invalid={!!errors.area}
          aria-describedby={errors.area ? 'area-error' : undefined}
        />
        {errors.area && (
          <p id="area-error" className="text-xs text-destructive">
            {errors.area}
          </p>
        )}
      </div>

      {/* Landmark & Postal Code */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="landmark">
            Landmark <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="landmark"
            placeholder="Near ABC Mall"
            value={form.landmark}
            onChange={(e) => set('landmark', e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="postalCode">
            Postal Code <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="postalCode"
            placeholder="44600"
            value={form.postalCode}
            onChange={(e) => set('postalCode', e.target.value)}
          />
        </div>
      </div>

      {/* Label */}
      <div className="space-y-1.5">
        <Label>Address Label</Label>
        <div className="flex gap-2">
          {labelOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => set('label', option)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                form.label === option
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border/50 text-muted-foreground hover:border-border'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {/* Checkboxes */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Checkbox
            id="saveAddress"
            checked={form.saveAddress}
            onCheckedChange={(checked) => set('saveAddress', checked === true)}
          />
          <Label
            htmlFor="saveAddress"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            Save this address to my account
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="isDefault"
            checked={form.isDefault}
            onCheckedChange={(checked) => set('isDefault', checked === true)}
          />
          <Label
            htmlFor="isDefault"
            className="text-xs font-normal text-muted-foreground cursor-pointer"
          >
            Set as default address
          </Label>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        <Button type="submit" size="lg" className="flex-1 rounded-xl">
          Save & Continue
        </Button>
        <Button type="button" variant="ghost" size="lg" onClick={onCancel} className="rounded-xl">
          Cancel
        </Button>
      </div>
    </motion.form>
  )
}
