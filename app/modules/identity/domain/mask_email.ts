/*
 * An address as an operator may see it in a command's output: the first
 * character of the local part, then "•••", then the domain, so
 * `ram@example.com` reads `r•••@example.com` (docs/09 §9.1 "Output"). The
 * rule lives in shared/format/email.ts, so `/verify-email` masks the
 * address the same way in the browser (docs/08 §2.3).
 */
export { maskEmail } from '#shared/format/email'
