/*
 * Money is whole paisa everywhere in v1 (docs/04 §18.1, ADR-0007). These
 * turn paisa into what people read and rupees people type into paisa, by
 * integer and string arithmetic only, so the server, the email and the
 * browser all agree.
 */

/*
 * The display prefix (docs/08 §5.11), joined to the amount with a no-break
 * space so it never wraps away from it.
 */
export const NPR_DISPLAY_PREFIX = 'Rs'

// U+00A0, the space ICU puts after "Rs" in its own NPR format.
const NBSP = String.fromCharCode(0xa0)

const groupRupees = new Intl.NumberFormat('en-IN')

function splitPaisa(minor: number) {
  if (!Number.isSafeInteger(minor)) {
    throw new RangeError(`Not a whole number of paisa: ${minor}`)
  }
  const magnitude = Math.abs(minor)
  const paisa = magnitude % 100
  return { negative: minor < 0, rupees: (magnitude - paisa) / 100, paisa }
}

/*
 * "Rs 7,250" and "Rs 7,250.50": lakh grouping, paisa only when not zero,
 * a minus before the prefix ("-Rs 1,000") (docs/08 §5.11).
 */
export function formatNPR(minor: number) {
  const { negative, rupees, paisa } = splitPaisa(minor)
  const fraction = paisa === 0 ? '' : `.${String(paisa).padStart(2, '0')}`
  return `${negative ? '-' : ''}${NPR_DISPLAY_PREFIX}${NBSP}${groupRupees.format(rupees)}${fraction}`
}

/*
 * Paisa as rupees for a form field to edit: 129950 -> "1299.50",
 * 129900 -> "1299". No grouping, so `parseRupeesToMinor` reads it back.
 */
export function minorToRupeesText(minor: number) {
  const { negative, rupees, paisa } = splitPaisa(minor)
  const fraction = paisa === 0 ? '' : `.${String(paisa).padStart(2, '0')}`
  return `${negative ? '-' : ''}${rupees}${fraction}`
}

/*
 * Paisa as rupees with exactly two decimals, for a provider that takes
 * rupee strings: 150000 -> "1500.00", 129950 -> "1299.50", 5 -> "0.05"
 * (docs/04 §18.1 "Provider formats", docs/05 §6.3 for Nepal Can Move).
 * Integer division and padStart only; never a float.
 */
export function minorToRupeesFixed(minor: number) {
  const { negative, rupees, paisa } = splitPaisa(minor)
  return `${negative ? '-' : ''}${rupees}.${String(paisa).padStart(2, '0')}`
}

const RUPEES_TYPED = /^(\d{1,9})(?:\.(\d{1,2}))?$/

/*
 * Rupees as people type them ("1,299.50", "1299.5", "1299") to paisa
 * (129950, 129950, 129900), never through a float: grouping commas go, the
 * fraction is padded to two digits, and the digits are joined as text
 * (docs/04 §18.1). Anything else ("1299.", "1.005", "-1", "") is null.
 */
export function parseRupeesToMinor(typed: string): number | null {
  const match = RUPEES_TYPED.exec(typed.trim().replaceAll(',', ''))
  if (!match) return null
  const [, whole, fraction = ''] = match
  return Number(whole + fraction.padEnd(2, '0'))
}

/*
 * The saving against a compare-at price, in whole percent rounded down
 * ("20% off" for 199900 against 250000; 02 AC-J02-03), from integer paisa.
 * Null when there is no higher compare-at price.
 */
export function discountPercent(priceMinor: number, compareAtMinor: number | null) {
  if (compareAtMinor === null || compareAtMinor <= priceMinor) return null
  return Math.floor(((compareAtMinor - priceMinor) * 100) / compareAtMinor)
}
