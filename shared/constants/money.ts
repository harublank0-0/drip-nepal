import { formatNPR } from '../format/money.js'

/*
 * The highest price a product variant can have, in paisa: Rs 1,00,00,000
 * (the form's limit before prices were paisa).
 */
export const PRICE_MAX_MINOR = 1_000_000_000

// Price messages the product form and the server both show.
export const PRICE_MESSAGES = {
  missing: 'Enter a price',
  unreadable: 'Enter an amount in rupees, such as 1299 or 1299.50',
  tooHigh: `The highest price is ${formatNPR(PRICE_MAX_MINOR)}`,
}
