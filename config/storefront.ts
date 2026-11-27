import env from '#start/env'

/*
 * A Nepali mobile number as wa.me wants it: digits only, with the 977
 * country code (98XXXXXXXX -> 97798XXXXXXXX).
 */
function whatsappNumber(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return digits.length === 10 ? `977${digits}` : digits
}

const phone = env.get('SUPPORT_PHONE')?.trim() || null

/*
 * How customers reach the store. Set in the environment; anything left
 * unset is hidden from the storefront.
 */
export const support = {
  phone,
  whatsapp: phone ? `https://wa.me/${whatsappNumber(phone)}` : null,
  email: env.get('SUPPORT_EMAIL') ?? null,
  instagram: env.get('INSTAGRAM_URL') ?? null,
  facebook: env.get('FACEBOOK_URL') ?? null,
  tiktok: env.get('TIKTOK_URL') ?? null,
}

/*
 * The public address of the site, for absolute links in social previews.
 */
export const appUrl = env.get('APP_URL').replace(/\/+$/, '')

/*
 * The public bucket's base URL (docs/09 §6.1 `MEDIA_PUBLIC_URL`), from which
 * the storefront pages build image URLs; empty where no store is set up
 * (tests), so a page then gives the keys alone.
 */
export const mediaPublicUrl = (env.get('MEDIA_PUBLIC_URL') ?? '').replace(/\/+$/, '')
