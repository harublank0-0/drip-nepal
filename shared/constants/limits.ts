/*
 * Input limits that a Vine validator and a form both use (docs/09 §13.5), so
 * a client rule mirrors the server's and never refuses what it accepts
 * (docs/08 §7.1 "Client rules mirror").
 */

// The courier account operations of docs/06 §13.8 (`createShopCourierAccount`,
// `adminCreateLogisticsAccount`, the re-key and status changes).
export const COURIER_LIMITS = {
  accountName: { min: 2, max: 80 },
  accountRef: { min: 1, max: 100 },
  // An NCM token [Verify-external VX-16]: printable ASCII without spaces.
  token: { min: 8, max: 200, pattern: /^[\x21-\x7e]+$/ },
  reason: { min: 3, max: 500 },
} as const
