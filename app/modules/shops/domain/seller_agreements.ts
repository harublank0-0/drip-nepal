/*
 * The seller agreement versions (docs/04a §6.4; 01 FR-SHOP-013): each
 * version's text is the file `resources/legal/seller-agreement/<version>.md`,
 * reviewed like code, and the version is its effective date, `YYYY-MM-DD`,
 * the format of `shop_agreements_version_check`. `acceptedUntil` is the last
 * day a shop may keep publishing on that version once a newer one is issued
 * (AC-FR-SHOP-013-3); null while it is current.
 *
 * The first version is a draft (`isFinal` false): its final text waits for
 * OD-04, OD-05 and OD-11 (risks §5, M2 row), and no vendor accepts it. The
 * one acceptance R1-S records is the owner's own, by `platform:create-shop`
 * (docs/09 §9.8), a formality that keeps the publish gate and INV-18
 * unchanged (docs/12 §9 part 1). A new version is a new entry here and a new
 * file; a published file is never edited.
 */
export type SellerAgreementVersion = {
  version: string
  isFinal: boolean
  acceptedUntil: string | null
}

export const SELLER_AGREEMENTS: readonly SellerAgreementVersion[] = [
  { version: '2026-11-23', isFinal: false, acceptedUntil: null },
]

// The version `applyForShop` and `acceptSellerAgreement` will take: the last one issued.
export const CURRENT_SELLER_AGREEMENT = SELLER_AGREEMENTS[SELLER_AGREEMENTS.length - 1]

/*
 * The versions a shop may still publish on, on a Kathmandu date `YYYY-MM-DD`
 * (AC-FR-SHOP-013-3): the current one, and an older one up to and including
 * its `acceptedUntil`. An older entry without `acceptedUntil` is not
 * accepted: only the last entry may leave it null.
 */
export function versionsAcceptedOn(
  day: string,
  registry: readonly SellerAgreementVersion[] = SELLER_AGREEMENTS
) {
  return registry
    .filter(
      (entry, index) =>
        index === registry.length - 1 ||
        (entry.acceptedUntil !== null && entry.acceptedUntil >= day)
    )
    .map((entry) => entry.version)
}
