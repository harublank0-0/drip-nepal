import { recordAudit } from '#modules/audit/actions/record_audit'
import { lockAccountByEmail } from '#modules/identity/queries'
import { encryptField } from '#modules/platform/crypto/field_encrypter'
import { withTx } from '#modules/platform/tx'
import type { BusinessType } from '#modules/shops/domain/business_type'
import { CURRENT_SELLER_AGREEMENT } from '#modules/shops/domain/seller_agreements'

/*
 * `BootstrapOwnerShop`, the shops entry action behind
 * `node ace platform:create-shop` (docs/09 §9.8; docs/12 §9 part 1; a CLI
 * action, not an HTTP operation). It creates the product owner's own shop
 * for the single-seller launch, with no application or review, as the
 * factory and seeders build an active shop (docs/04 §20.3), in one
 * transaction:
 *
 * 1. a transaction-scoped advisory lock serialises runs, then the owner's
 *    `users` row is locked (the owner lock of docs/04a §6.1); the account
 *    must exist and be `active`, and own no shop in any status;
 * 2. the slug must be free: no shop holds it and no shop's retired slug is
 *    it (`slug_redirects`, 04a §6.1, T-SHOP-106);
 * 3. the shop is inserted `pending_review` with `commission_rate_bp = 0`
 *    (A-62: the owner's shop snapshots a zero commission during R1-S);
 * 4. a `shop_agreements` row records the owner's acceptance of the current
 *    seller agreement version, a draft while OD-04, OD-05 and OD-11 are
 *    open (04a §6.4); `ip_hash` is `HOST_IP_HASH` and `request_id` the
 *    run's ID, because no client request exists;
 * 5. the shop becomes `active` by compare-and-set on `pending_review`, with
 *    `approved_at` and `approved_by` the owner: nobody reviewed it, and the
 *    `shops_require_agreement` trigger (INV-18) finds the row of step 4;
 * 6. one `shop.bootstrap` audit row by the system (proposed), with the run's
 *    ID and `source: host_command`, never a personal value.
 *
 * The owner gets no `shop_memberships` row: ownership is
 * `shops.owner_user_id` alone (04a §6.2, ADR-0006). No review decision
 * row is written, because no review took place (04a §6.5).
 * Verified by T-SHOP-007.
 */

export const OWNER_SHOP_LOCK = 'platform:create-shop'

/*
 * The `shop_agreements.ip_hash` of a row written from the host: 32 zero
 * bytes. The column holds the keyed HMAC of the client's address (04a §6.4),
 * and a run from the host has no client; an HMAC output is never all zeros
 * in practice, so the value marks host runs and correlates with no address.
 */
export const HOST_IP_HASH = Buffer.alloc(32)

export type OwnerShopInput = {
  // Normalised by the account email rule.
  ownerEmail: string
  slug: string
  name: string
  contactEmail: string
  contactPhoneE164: string
  businessType: BusinessType
  businessRegistrationNumber: string | null
  businessRegistrationAuthority: string | null
  panVatNumber: string | null
  isVatRegistered: boolean
  grievanceContactName: string
  grievanceContactPhoneE164: string
  returnPolicyText: string
  // Written to `shop_agreements.request_id` and the audit row's `request_id`.
  runId: string
}

export class OwnerNotEligible extends Error {
  // Null when no account holds the email.
  constructor(readonly status: string | null) {
    super(status ? `The owner's account is ${status}` : 'No account holds the email')
    this.name = 'OwnerNotEligible'
  }
}

export class OwnerHasShop extends Error {
  constructor() {
    super('The owner already owns a shop')
    this.name = 'OwnerHasShop'
  }
}

export class ShopSlugTaken extends Error {
  constructor() {
    super('The slug is held by another shop')
    this.name = 'ShopSlugTaken'
  }
}

export default class BootstrapOwnerShop {
  async execute(input: OwnerShopInput) {
    const grievancePhoneEnc = encryptField(
      input.grievanceContactPhoneE164,
      'shops.grievance_contact_phone_enc'
    )
    return withTx(async (trx) => {
      await trx.rawQuery('SELECT pg_advisory_xact_lock(hashtext(?))', [OWNER_SHOP_LOCK])
      const owner = await lockAccountByEmail(trx, input.ownerEmail)
      if (!owner) throw new OwnerNotEligible(null)
      if (owner.status !== 'active') throw new OwnerNotEligible(owner.status)

      const owned = await trx
        .from('shops')
        .where('owner_user_id', owner.userId)
        .select('id')
        .first()
      if (owned) throw new OwnerHasShop()
      const taken = await trx.rawQuery(
        `SELECT EXISTS (SELECT 1 FROM shops WHERE slug = :slug)
             OR EXISTS (SELECT 1 FROM slug_redirects
                         WHERE entity_type = 'shop' AND old_slug = :slug) AS taken`,
        { slug: input.slug }
      )
      if (taken.rows[0].taken === true) throw new ShopSlugTaken()

      let shopId: string
      try {
        const [shop] = await trx
          .table('shops')
          .insert({
            owner_user_id: owner.userId,
            name: input.name,
            slug: input.slug,
            status: 'pending_review',
            commission_rate_bp: 0,
            contact_email: input.contactEmail,
            contact_phone_e164: input.contactPhoneE164,
            return_policy_text: input.returnPolicyText,
            business_type: input.businessType,
            business_registration_number: input.businessRegistrationNumber,
            business_registration_authority: input.businessRegistrationAuthority,
            pan_vat_number: input.panVatNumber,
            is_vat_registered: input.isVatRegistered,
            grievance_contact_name: input.grievanceContactName,
            grievance_contact_phone_enc: grievancePhoneEnc,
          })
          .returning('id')
        shopId = shop.id
      } catch (error) {
        // A shop that is not created through this command took the slug meanwhile.
        const pg = error as { code?: string; constraint?: string }
        if (pg.code === '23505' && pg.constraint === 'shops_slug_key') throw new ShopSlugTaken()
        throw error
      }

      await trx.table('shop_agreements').insert({
        shop_id: shopId,
        agreement_version: CURRENT_SELLER_AGREEMENT.version,
        accepted_by_user_id: owner.userId,
        ip_hash: HOST_IP_HASH,
        request_id: input.runId,
      })
      await trx
        .from('shops')
        .where({ id: shopId, status: 'pending_review' })
        .update({
          status: 'active',
          approved_at: trx.knexRawQuery('now()'),
          approved_by: owner.userId,
        })

      await recordAudit(trx, {
        actorType: 'system',
        action: 'shop.bootstrap',
        subjectType: 'shop',
        subjectId: shopId,
        shopId,
        requestId: input.runId,
        changes: {
          source: 'host_command',
          status: { from: null, to: 'active' },
          owner_user_id: owner.userId,
          approved_by: owner.userId,
          agreement_version: CURRENT_SELLER_AGREEMENT.version,
          commission_rate_bp: 0,
          business_type: input.businessType,
          changed: ['grievance_contact_name', 'grievance_contact_phone_enc'],
        },
      })
      return {
        shopId,
        slug: input.slug,
        agreementVersion: CURRENT_SELLER_AGREEMENT.version,
        agreementIsFinal: CURRENT_SELLER_AGREEMENT.isFinal,
      }
    })
  }
}
