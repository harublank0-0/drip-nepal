import { randomUUID } from 'node:crypto'
import db from '@adonisjs/lucid/services/db'
import BootstrapOwnerShop, {
  type OwnerShopInput,
} from '#modules/shops/actions/bootstrap_owner_shop'
import { UserFactory } from '#database/factories/user_factory'

/*
 * Shops for the seller tests, built through the real entry action of
 * `platform:create-shop` (docs/09 §9.8), so the grievance phone is really
 * encrypted and the shop holds an agreement row for the current version, as
 * the owner's shop does (dripnepal-testing skill, "Set up state through the
 * real actions"). Each call makes a new active owner and unique values.
 * Members are inserted as rows, because `acceptShopInvitation` (M2) does
 * not exist yet.
 */

export const GRIEVANCE = { name: 'Synthetic Grievance Officer', phone: '+9779800000042' }

let sequence = 0

export function ownerShopInput(ownerEmail: string, values: Partial<OwnerShopInput> = {}) {
  sequence += 1
  const suffix = `${Date.now().toString(36)}-${sequence}`
  return {
    ownerEmail,
    slug: `owner-shop-${suffix}`,
    name: `Owner Shop ${sequence}`,
    contactEmail: `owner-shop-${suffix}@example.com`,
    contactPhoneE164: '+97714123456',
    businessType: 'individual',
    businessRegistrationNumber: null,
    businessRegistrationAuthority: null,
    panVatNumber: '123456789',
    isVatRegistered: false,
    grievanceContactName: GRIEVANCE.name,
    grievanceContactPhoneE164: GRIEVANCE.phone,
    returnPolicyText: 'Returns within 7 days, unworn and with tags.',
    runId: randomUUID(),
    ...values,
  } satisfies OwnerShopInput
}

export type OwnerShop = {
  shopId: string
  slug: string
  name: string
  contactEmail: string
  ownerId: string
}

export async function createOwnerShop(values: Partial<OwnerShopInput> = {}): Promise<OwnerShop> {
  const owner = await UserFactory.create()
  const input = ownerShopInput(owner.email, values)
  const shop = await new BootstrapOwnerShop().execute(input)
  return {
    shopId: shop.shopId,
    slug: shop.slug,
    name: input.name,
    contactEmail: input.contactEmail,
    ownerId: owner.id,
  }
}

// An active member of `shopId` with `role`, as `acceptShopInvitation` will create it (04a §6.2).
export async function addMember(
  shopId: string,
  role: string,
  status: 'active' | 'removed' = 'active'
) {
  const member = await UserFactory.create()
  await db.table('shop_memberships').insert({
    shop_id: shopId,
    user_id: member.id,
    role,
    status,
    removed_at: status === 'removed' ? new Date() : null,
  })
  return member.id
}

// A status the shop cannot reach through a built action yet, with the columns its CHECKs tie to it.
export async function setShopStatus(
  shopId: string,
  status: 'pending_review' | 'rejected' | 'suspended' | 'closed',
  suspensionMode: 'fulfill_existing' | 'frozen' | null = null
) {
  await db
    .from('shops')
    .where('id', shopId)
    .update({
      status,
      suspension_mode: status === 'suspended' ? (suspensionMode ?? 'fulfill_existing') : null,
      closed_at: status === 'closed' ? new Date() : null,
    })
}
