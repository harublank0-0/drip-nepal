/*
 * An email address shown without most of its local part: the first
 * character, then "•••", then the domain, so `ram@example.com` reads
 * `r•••@example.com`. Used by `platform:create-admin`'s output (docs/09
 * §9.1 "Output") and by `/verify-email` right after `signUp`, which shows
 * the address the user typed, masked in the browser, and looks nothing up
 * (docs/08 §2.3, 02 J-04 step 3). Anything without a local part reads
 * `•••`.
 */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}
