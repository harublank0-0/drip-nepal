import { ProvincesWithDistricts } from '@shared/constants/provinces_with_districts'
import { Field, FieldDescription, FieldError, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'

export type AddressFields = {
  label: string
  recipientName: string
  recipientPhone: string
  province: string
  district: string
  municipality: string
  city: string
  area: string
  streetAddress: string
}

export type AddressField = keyof AddressFields

export function emptyAddress(recipientName = ''): AddressFields {
  return {
    label: '',
    recipientName,
    recipientPhone: '',
    province: '',
    district: '',
    municipality: '',
    city: '',
    area: '',
    streetAddress: '',
  }
}

/*
 * The checkout payload's `address`: optional fields left out when blank,
 * spaces and dashes taken out of the phone number.
 */
export function addressPayload(address: AddressFields) {
  const optional = (value: string) => value.trim() || undefined
  return {
    label: optional(address.label),
    recipientName: address.recipientName.trim(),
    recipientPhone: address.recipientPhone.replace(/[\s-]/g, ''),
    province: address.province,
    district: address.district,
    municipality: optional(address.municipality),
    city: address.city.trim(),
    area: optional(address.area),
    streetAddress: address.streetAddress.trim(),
  }
}

/* Field order on screen, for focusing the first invalid one. */
export const ADDRESS_FIELDS: AddressField[] = [
  'recipientName',
  'recipientPhone',
  'province',
  'district',
  'municipality',
  'city',
  'area',
  'streetAddress',
  'label',
]

export function addressFieldId(field: AddressField) {
  return `address-${field}`
}

const FIELD_LABELS: Record<AddressField, string> = {
  label: 'Label',
  recipientName: 'Full name',
  recipientPhone: 'Mobile number',
  province: 'Province',
  district: 'District',
  municipality: 'Municipality',
  city: 'City / town',
  area: 'Area / tole',
  streetAddress: 'Street address',
}

/*
 * The server sends VineJS's default messages ("The recipientPhone field
 * format is invalid"); reword them for people.
 */
export function addressError(errors: Record<string, unknown> | undefined, field: AddressField) {
  const message = errors?.[`address.${field}`]
  if (typeof message !== 'string') return undefined

  const label = FIELD_LABELS[field]
  if (field === 'recipientPhone' && message.includes('format is invalid')) {
    return 'Enter a Nepali mobile number, e.g. 9841234567'
  }
  if (message.includes('must be defined')) return `${label} is required`
  if (message.startsWith('The selected')) return `Choose a ${label.toLowerCase()}`
  return message.replace(new RegExp(`^The ${field} field`), label)
}

type MunicipalityLists = Record<string, Record<string, Record<string, string[]>>>

const PROVINCES = Object.keys(ProvincesWithDistricts)

const MUNICIPALITY_KINDS = [
  { key: 'Ma.Na.Pa.', label: 'Metropolitan cities' },
  { key: 'Upa.Ma.', label: 'Sub-metropolitan cities' },
  { key: 'Na.Pa.', label: 'Municipalities' },
  { key: 'Ga.Pa.', label: 'Rural municipalities' },
]

function districtsOf(province: string) {
  const districts = (ProvincesWithDistricts as unknown as MunicipalityLists)[province]
  return districts ? Object.keys(districts) : []
}

function municipalitiesOf(province: string, district: string) {
  const lists = (ProvincesWithDistricts as unknown as MunicipalityLists)[province]?.[district]
  if (!lists) return []
  return MUNICIPALITY_KINDS.map((kind) => ({ ...kind, names: lists[kind.key] ?? [] })).filter(
    (kind) => kind.names.length > 0
  )
}

type AddressFormProps = {
  value: AddressFields
  onChange: (patch: Partial<AddressFields>) => void
  errors?: Record<string, unknown>
  disabled?: boolean
  /* A guest's address is used for this order only, so there is no label. */
  guest?: boolean
}

/*
 * A new delivery address. Province, district and municipality come from
 * the shared list so the server's "district belongs to province" check
 * passes.
 */
export function AddressForm({ value, onChange, errors, disabled, guest }: AddressFormProps) {
  const districts = districtsOf(value.province)
  const municipalities = municipalitiesOf(value.province, value.district)

  const fieldProps = (field: AddressField) => {
    const error = addressError(errors, field)
    return {
      'id': addressFieldId(field),
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${addressFieldId(field)}-error` : undefined,
      disabled,
    }
  }

  const errorFor = (field: AddressField) => {
    const error = addressError(errors, field)
    return error ? <FieldError id={`${addressFieldId(field)}-error`}>{error}</FieldError> : null
  }

  const text = (field: AddressField) => ({
    ...fieldProps(field),
    value: value[field],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ [field]: event.target.value }),
    className: 'h-10',
  })

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field data-invalid={!!addressError(errors, 'recipientName')}>
        <FieldLabel htmlFor={addressFieldId('recipientName')}>Full name</FieldLabel>
        <Input {...text('recipientName')} autoComplete="name" maxLength={100} />
        {errorFor('recipientName')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'recipientPhone')}>
        <FieldLabel htmlFor={addressFieldId('recipientPhone')}>Mobile number</FieldLabel>
        <Input
          {...text('recipientPhone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98XXXXXXXX"
          maxLength={16}
        />
        {errorFor('recipientPhone') ?? (
          <FieldDescription className="text-xs">
            {guest
              ? 'The shop calls this number to deliver. You also need it to track your order.'
              : 'The shop calls this number to deliver.'}
          </FieldDescription>
        )}
      </Field>

      <Field data-invalid={!!addressError(errors, 'province')}>
        <FieldLabel htmlFor={addressFieldId('province')}>Province</FieldLabel>
        <Select
          value={value.province}
          onValueChange={(province) => onChange({ province, district: '', municipality: '' })}
          disabled={disabled}
        >
          <SelectTrigger {...fieldProps('province')} className="w-full data-[size=default]:h-10">
            <SelectValue placeholder="Choose province" />
          </SelectTrigger>
          <SelectContent position="popper">
            {PROVINCES.map((province) => (
              <SelectItem key={province} value={province}>
                {province}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errorFor('province')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'district')}>
        <FieldLabel htmlFor={addressFieldId('district')}>District</FieldLabel>
        <Select
          value={value.district}
          onValueChange={(district) => onChange({ district, municipality: '' })}
          disabled={disabled || districts.length === 0}
        >
          <SelectTrigger
            {...fieldProps('district')}
            disabled={disabled || districts.length === 0}
            className="w-full data-[size=default]:h-10"
          >
            <SelectValue
              placeholder={value.province ? 'Choose district' : 'Choose province first'}
            />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            {districts.map((district) => (
              <SelectItem key={district} value={district}>
                {district}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errorFor('district')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'municipality')}>
        <FieldLabel htmlFor={addressFieldId('municipality')}>
          Municipality <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Select
          value={value.municipality}
          onValueChange={(municipality) => onChange({ municipality })}
          disabled={disabled || municipalities.length === 0}
        >
          <SelectTrigger
            {...fieldProps('municipality')}
            disabled={disabled || municipalities.length === 0}
            className="w-full data-[size=default]:h-10"
          >
            <SelectValue
              placeholder={value.district ? 'Choose municipality' : 'Choose district first'}
            />
          </SelectTrigger>
          <SelectContent position="popper" className="max-h-72">
            {municipalities.map((kind) => (
              <SelectGroup key={kind.key}>
                <SelectLabel>{kind.label}</SelectLabel>
                {kind.names.map((name) => (
                  <SelectItem key={`${kind.key}-${name}`} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        {errorFor('municipality')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'city')}>
        <FieldLabel htmlFor={addressFieldId('city')}>City / town</FieldLabel>
        <Input
          {...text('city')}
          autoComplete="address-level2"
          placeholder="e.g. Lalitpur"
          maxLength={50}
        />
        {errorFor('city')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'area')}>
        <FieldLabel htmlFor={addressFieldId('area')}>
          Area / tole <span className="font-normal text-muted-foreground">(optional)</span>
        </FieldLabel>
        <Input
          {...text('area')}
          autoComplete="address-level3"
          placeholder="e.g. Jhamsikhel"
          maxLength={50}
        />
        {errorFor('area')}
      </Field>

      <Field data-invalid={!!addressError(errors, 'streetAddress')}>
        <FieldLabel htmlFor={addressFieldId('streetAddress')}>Street address</FieldLabel>
        <Input
          {...text('streetAddress')}
          autoComplete="street-address"
          placeholder="House no., street, nearby landmark"
          maxLength={200}
        />
        {errorFor('streetAddress')}
      </Field>

      {!guest && (
        <Field data-invalid={!!addressError(errors, 'label')} className="sm:col-span-2">
          <FieldLabel htmlFor={addressFieldId('label')}>
            Save as <span className="font-normal text-muted-foreground">(optional)</span>
          </FieldLabel>
          <Input {...text('label')} placeholder="e.g. Home, Office" maxLength={50} />
          {errorFor('label') ?? (
            <FieldDescription className="text-xs">
              We&apos;ll keep this address for your next order.
            </FieldDescription>
          )}
        </Field>
      )}
    </div>
  )
}
