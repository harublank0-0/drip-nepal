import env from '#start/env'

/*
 * v1 runs with one seller. Shop registration stays closed (its page and
 * API answer 404, and the storefront hides its links) unless
 * SHOP_REGISTRATION_OPEN=true. Open it briefly to register your own shop.
 */
export const shopRegistrationOpen = env.get('SHOP_REGISTRATION_OPEN') ?? false
