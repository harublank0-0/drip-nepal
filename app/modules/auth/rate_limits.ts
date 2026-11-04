import { createHmac } from 'node:crypto'
import { isIPv6 } from 'node:net'
import limiter from '@adonisjs/limiter/services/main'
import { errors as limiterErrors, type Limiter } from '@adonisjs/limiter'
import { errors as vineErrors } from '@vinejs/vine'
import env from '#start/env'

/*
 * Login and signup rate limits (RF-12, RF-38). Login uses the values of
 * docs/06 §9.1. Signup allows 20 an hour per network, not 5: mobile carriers
 * in Nepal put many customers behind one address, and a few typos must not
 * lock someone out for an hour.
 */
export const loginNetworkLimiter = () => limiter.use({ requests: 20, duration: '1 minute' })
export const loginAccountLimiter = () => limiter.use({ requests: 5, duration: '1 minute' })
export const signupNetworkLimiter = () => limiter.use({ requests: 20, duration: '1 hour' })

/*
 * Guest checkout and order tracking. Guests can place 10 orders an hour per
 * network, against floods of fake cash-on-delivery orders. Tracking allows
 * 10 failed lookups per 15 minutes per network, so order numbers can't be
 * guessed against a phone number.
 */
export const guestCheckoutLimiter = () => limiter.use({ requests: 10, duration: '1 hour' })
export const orderLookupLimiter = () =>
  limiter.use({ requests: 10, duration: '15 minutes', blockDuration: '15 minutes' })

/*
 * The part of an address a limiter keys on (docs/07 §3.6): IPv4 as is, an
 * IPv4-mapped IPv6 address as its IPv4 address, any other IPv6 address as
 * its /64, so one host cannot get a fresh bucket per address.
 */
export function clientNetwork(ip: string) {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)
  if (mapped) return mapped[1]
  if (!isIPv6(ip)) return ip

  const [head, tail = ''] = ip.split('::')
  const headParts = head ? head.split(':') : []
  const tailParts = tail ? tail.split(':') : []
  const missing = ip.includes('::') ? 8 - headParts.length - tailParts.length : 0
  const groups = [...headParts, ...Array(missing).fill('0'), ...tailParts]
  return `${groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().padStart(4, '0'))
    .join(':')}::/64`
}

/*
 * Keys never hold raw emails or addresses (docs/04a §15.4): the identifying
 * part is an HMAC under the app key.
 */
export function limiterKey(name: string, ...parts: string[]) {
  const digest = createHmac('sha256', env.get('APP_KEY').release())
    .update(parts.join('|'))
    .digest('hex')
    .slice(0, 32)
  return `${name}:${digest}`
}

export function tooManyAttempts(field: string, seconds: number): never {
  throw new vineErrors.E_VALIDATION_ERROR([
    { field, message: `Too many attempts. Try again in ${Math.max(1, seconds)} seconds.` },
  ])
}

/*
 * Counts one attempt, or answers the form with a "try again" error when the
 * limit is used up.
 */
export async function consumeOrReject(rateLimiter: Limiter, key: string, field: string) {
  try {
    await rateLimiter.consume(key)
  } catch (error) {
    if (error instanceof limiterErrors.E_TOO_MANY_REQUESTS) {
      tooManyAttempts(field, error.response.availableIn)
    }
    throw error
  }
}
