const priceFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 })

/*
 * Formats an amount in Nepali rupees with South Asian digit grouping,
 * e.g. 125000 -> "Rs. 1,25,000". Uses Latin digits so the server render
 * and the browser render match.
 */
export function formatPrice(amount: number) {
  return `Rs. ${priceFormatter.format(amount)}`
}

/*
 * Dates are shown in Nepal time (docs/01: times are in Asia/Kathmandu).
 * Naming the zone also makes the server render and the browser render
 * agree: the server runs in UTC, so without it an order placed between
 * 00:00 and 05:45 in Nepal showed the previous day until the page
 * hydrated, and React re-rendered the whole page.
 */
const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'Asia/Kathmandu',
})

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return ''
  return dateFormatter.format(new Date(value))
}

const yearFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  timeZone: 'Asia/Kathmandu',
})

/*
 * The year in Nepal, for the footers: in Nepal's first hours of a new year
 * it is still the old year in UTC, where the server renders.
 */
export function currentYear(now = new Date()) {
  return yearFormatter.format(now)
}
