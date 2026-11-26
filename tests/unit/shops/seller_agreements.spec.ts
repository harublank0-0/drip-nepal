import { test } from '@japa/runner'
import {
  SELLER_AGREEMENTS,
  versionsAcceptedOn,
  type SellerAgreementVersion,
} from '#modules/shops/domain/seller_agreements'

/*
 * T-CAT-013: the agreement item of the publish gate accepts a version the
 * platform still accepts (AC-FR-SHOP-013-3): the current one, and an older
 * one up to and including its `acceptedUntil`, a Kathmandu date.
 */
const REGISTRY: SellerAgreementVersion[] = [
  { version: '2026-01-01', isFinal: true, acceptedUntil: null },
  { version: '2026-11-23', isFinal: true, acceptedUntil: '2027-01-31' },
  { version: '2027-01-01', isFinal: true, acceptedUntil: null },
]

test.group('T-CAT-013 seller agreement versions still accepted', () => {
  test('T-CAT-013 an older version is accepted up to and including its last day', ({ assert }) => {
    assert.deepEqual(versionsAcceptedOn('2027-01-31', REGISTRY), ['2026-11-23', '2027-01-01'])
    assert.deepEqual(versionsAcceptedOn('2027-02-01', REGISTRY), ['2027-01-01'])
  })

  test('T-CAT-013 an older version without a last day is not accepted', ({ assert }) => {
    assert.notInclude(versionsAcceptedOn('2026-06-01', REGISTRY), '2026-01-01')
  })

  test('T-CAT-013 the registry today accepts its current version', ({ assert }) => {
    assert.include(
      versionsAcceptedOn('2026-11-26'),
      SELLER_AGREEMENTS[SELLER_AGREEMENTS.length - 1].version
    )
  })
})
