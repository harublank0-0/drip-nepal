/*
 * An address as an operator may see it in a command's output: the first
 * character of the local part, then "•••", then the domain, so
 * `ram@example.com` reads `r•••@example.com` (docs/09 §9.1 "Output").
 */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}
