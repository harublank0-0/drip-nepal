/**
 * Returns a random number between min and max inclusively.
 */
export const random = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Returns a cryptographically random lowercase alphanumeric string.
 * Used for slug suffixes, SKUs, file names and order numbers.
 */
export function randomCode(length: number) {
  const bytes = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(bytes, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
}
