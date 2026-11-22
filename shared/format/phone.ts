/*
 * Nepali mobile numbers (docs/04 §2.8; 01 AC-FR-IAM-001-5, AC-J04-04): the
 * one rule the server's validator and `NepalPhoneInput` (docs/08 §4.3)
 * share, so a client rule never refuses what the server accepts. A mobile
 * is `9`, then `6`, `7` or `8`, then eight digits, the structure of the NTA
 * numbering plan, checked by structure and not by operator prefix (VX-11).
 * Input may carry `+977`, `977` or a leading `0`, and spaces or hyphens
 * between the digits; it is stored in E.164, `+9779XXXXXXXXX`.
 */

// The stored form (`users.phone_enc` holds it encrypted, docs/04a §5.1).
export const NEPAL_MOBILE_E164 = /^\+9779[678]\d{8}$/

// After separators are removed: an optional prefix, then the ten-digit mobile.
const MOBILE_INPUT = /^(?:\+?977|0)?(9[678]\d{8})$/

/*
 * The E.164 form of a Nepali mobile number as typed, or null when it is not
 * one: `9841234567`, `+977 984-123-4567` and `09612345678` are accepted;
 * `9012345678` (another range), `984123456` (nine digits) and `014123456`
 * (a landline) are not. A ten-digit mobile that itself starts with `977`
 * keeps its digits: the prefix is tried first and dropped when the rest is
 * not a mobile.
 */
export function toNepalMobileE164(input: string): string | null {
  const compact = input.trim().replaceAll(/[\s-]/g, '')
  const match = MOBILE_INPUT.exec(compact)
  return match ? `+977${match[1]}` : null
}
