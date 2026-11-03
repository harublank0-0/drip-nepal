const priceFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/*
 * Formats an amount in Nepali rupees with South Asian digit grouping,
 * e.g. 125000 -> "Rs. 1,25,000". Uses Latin digits so the server render
 * and the browser render match.
 */
export function formatPrice(amount: number) {
  return `Rs. ${priceFormatter.format(amount)}`
}

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return ''
  return dateFormatter.format(new Date(value))
}
