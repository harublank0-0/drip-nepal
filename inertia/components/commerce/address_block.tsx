import { cn } from '~/lib/utils'

export type AddressLike = {
  recipientName: string
  recipientPhone?: string | null
  province: string
  district: string
  municipality?: string | null
  city: string
  area?: string | null
  streetAddress: string
}

/*
 * The parts of an address in reading order, without blanks or repeats
 * (city and municipality are often the same place).
 */
export function addressParts(address: AddressLike) {
  const seen = new Set<string>()
  const keep = (value: string | null | undefined) => {
    const trimmed = value?.trim()
    if (!trimmed || seen.has(trimmed.toLowerCase())) return null
    seen.add(trimmed.toLowerCase())
    return trimmed
  }

  const street = [keep(address.streetAddress), keep(address.area)].filter(Boolean).join(', ')
  const region = [
    keep(address.city),
    keep(address.municipality),
    keep(address.district),
    address.province ? `${address.province} Province` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return { street, region }
}

export function AddressBlock({ address, className }: { address: AddressLike; className?: string }) {
  const { street, region } = addressParts(address)

  return (
    <address className={cn('text-sm not-italic', className)}>
      <p className="font-medium">{address.recipientName}</p>
      {address.recipientPhone && (
        <p className="text-muted-foreground tabular-nums">{address.recipientPhone}</p>
      )}
      <p className="mt-1 text-muted-foreground">{street}</p>
      <p className="text-muted-foreground">{region}</p>
    </address>
  )
}
