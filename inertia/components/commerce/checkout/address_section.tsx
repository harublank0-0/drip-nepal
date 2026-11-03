import type { Data } from '@generated/data'
import { PlusIcon } from 'lucide-react'
import { AddressBlock } from '~/components/commerce/address_block'
import { Badge } from '~/components/ui/badge'
import { FieldError } from '~/components/ui/field'
import { cn } from '~/lib/utils'
import { AddressForm, type AddressFields } from './address_form'

export type AddressMode = 'saved' | 'new'

type AddressSectionProps = {
  addresses: Data.Address[]
  mode: AddressMode
  addressId: string
  address: AddressFields
  errors?: Record<string, unknown>
  disabled?: boolean
  onPickSaved: (id: string) => void
  onPickNew: () => void
  onAddressChange: (patch: Partial<AddressFields>) => void
}

const optionClass =
  'flex cursor-pointer gap-3 rounded-xl border border-border/60 p-4 transition-colors hover:border-border has-checked:border-primary has-checked:bg-primary/5 has-focus-visible:ring-3 has-focus-visible:ring-ring/50'

/*
 * Pick an address from the address book, or enter a new one (which the
 * server saves to the address book).
 */
export function AddressSection({
  addresses,
  mode,
  addressId,
  address,
  errors,
  disabled,
  onPickSaved,
  onPickNew,
  onAddressChange,
}: AddressSectionProps) {
  const addressIdError = typeof errors?.addressId === 'string' ? errors.addressId : undefined

  if (addresses.length === 0) {
    return (
      <AddressForm value={address} onChange={onAddressChange} errors={errors} disabled={disabled} />
    )
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Saved addresses" className="space-y-3">
        {addresses.map((saved) => (
          <label key={saved.id} className={optionClass}>
            <input
              type="radio"
              name="delivery-address"
              value={saved.id}
              checked={mode === 'saved' && addressId === saved.id}
              onChange={() => onPickSaved(saved.id)}
              disabled={disabled}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <div className="min-w-0 flex-1">
              {(saved.label || saved.isDefault) && (
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  {saved.label && <span className="text-sm font-semibold">{saved.label}</span>}
                  {saved.isDefault && <Badge variant="secondary">Default</Badge>}
                </div>
              )}
              <AddressBlock address={saved} />
            </div>
          </label>
        ))}

        <label className={cn(optionClass, 'items-center')}>
          <input
            type="radio"
            name="delivery-address"
            value="new"
            checked={mode === 'new'}
            onChange={onPickNew}
            disabled={disabled}
            className="size-4 shrink-0 accent-primary"
          />
          <span className="flex items-center gap-2 text-sm font-medium">
            <PlusIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            Deliver to a new address
          </span>
        </label>
      </div>

      {addressIdError && <FieldError>{addressIdError}</FieldError>}

      {mode === 'new' && (
        <div className="rounded-xl border border-border/60 p-4">
          <AddressForm
            value={address}
            onChange={onAddressChange}
            errors={errors}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  )
}
