import { randomBytes } from 'node:crypto'
import { chmod, mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import app from '@adonisjs/core/services/app'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import User from '#models/user'
import Shop from '#models/shop'
import { DEMO_EMAIL_DOMAIN } from '#modules/identity/queries'
import { DevSeeder } from '#database/support/dev_seeder'
import { UserFactory } from '#database/factories/user_factory'
import { ShopFactory } from '#database/factories/shop_factory'
import { placeholderCiphertext } from '#database/factories/placeholder_ciphertext'

/*
 * The demo marketplace (docs/09 §8.8, docs/04 §20.3). Until sign-up, shop
 * approval and order placement exist, it writes its rows with the factories
 * (OD-59 amended 2026-11-22, docs/risks §2.3); it moves to the real actions
 * when they arrive. It creates:
 *
 * - the demo owner, manager and order fulfiller under `dev.dripnepal.invalid`;
 * - the owner's active shop `demo-pasal`, with the other two as members, and
 *   a second shop `demo-pasal-2` still in `pending_review`;
 * - for each active staff account without TOTP, a placeholder enrolment that
 *   decrypts under no key, in place of M1's enrolment, so the
 *   development-only sign-in can open the admin pages (docs/07 §3.13). It
 *   creates no staff account: `platform:create-admin` does (docs/09 §9.1).
 *
 * One random password per run, for every demo account, goes to the
 * git-ignored tmp/dev_credentials.json with mode 0600 and is never printed.
 * A second run creates no row: it finds the users by address and the shops by
 * slug, and gives the demo accounts the new password, so the file stays true
 * (T-ARCH-036). Later pull requests add what their pages show.
 */

const demoEmail = (local: string) => `${local}@${DEMO_EMAIL_DOMAIN}`

export const DEMO_ACCOUNTS = [
  { key: 'owner', email: demoEmail('owner'), fullName: 'Demo Owner' },
  { key: 'manager', email: demoEmail('manager'), fullName: 'Demo Manager' },
  { key: 'fulfiller', email: demoEmail('fulfiller'), fullName: 'Demo Fulfiller' },
] as const

type AccountKey = (typeof DEMO_ACCOUNTS)[number]['key']

export const DEMO_SHOPS = [
  {
    slug: 'demo-pasal',
    name: 'Demo Pasal',
    active: true,
    members: [
      { account: 'manager', role: 'manager' },
      { account: 'fulfiller', role: 'order_fulfiller' },
    ],
  },
  { slug: 'demo-pasal-2', name: 'Demo Pasal 2', active: false, members: [] },
] as const

// What each account is, for the credentials file.
const ROLES: Record<AccountKey, string> = {
  owner: 'owner of demo-pasal (active) and demo-pasal-2 (pending_review)',
  manager: 'manager of demo-pasal',
  fulfiller: 'order fulfiller of demo-pasal',
}

export default class DemoMarketplaceSeeder extends DevSeeder {
  // One random password per run (docs/09 §8.8).
  protected password = randomBytes(18).toString('base64url')
  protected credentialsPath = app.makePath('tmp', 'dev_credentials.json')

  protected async seed() {
    await this.client.transaction(async (trx) => {
      const users = await this.#accounts(trx)
      await this.#shops(trx, users)
      await this.#staffTotpStandIn(trx)
    })
    await this.#writeCredentials()
  }

  async #accounts(trx: TransactionClientContract) {
    const users = {} as Record<AccountKey, User>
    for (const account of DEMO_ACCOUNTS) {
      const existing = await User.query({ client: trx }).where('email', account.email).first()
      if (existing) {
        // The model's auth hook hashes the new run's password on save.
        existing.passwordHash = this.password
        await existing.useTransaction(trx).save()
        users[account.key] = existing
      } else {
        users[account.key] = await UserFactory.client(trx)
          .merge({ email: account.email, fullName: account.fullName, passwordHash: this.password })
          .create()
      }
    }
    return users
  }

  async #shops(trx: TransactionClientContract, users: Record<AccountKey, User>) {
    for (const demo of DEMO_SHOPS) {
      const existing = await Shop.query({ client: trx }).where('slug', demo.slug).first()
      if (existing) continue
      const builder = ShopFactory.client(trx).merge({
        slug: demo.slug,
        name: demo.name,
        ownerUserId: users.owner.id,
      })
      const shop = await (demo.active ? builder.apply('active') : builder).create()
      for (const member of demo.members) {
        await trx.insertQuery().table('shop_memberships').insert({
          shop_id: shop.id,
          user_id: users[member.account].id,
          role: member.role,
          status: 'active',
          invited_by: users.owner.id,
        })
      }
    }
  }

  // In place of M1's TOTP enrolment (docs/07 §3.13); never for a revoked or inactive account.
  async #staffTotpStandIn(trx: TransactionClientContract) {
    const rows = await trx
      .from('users')
      .where('status', 'active')
      .whereNull('mfa_enabled_at')
      .whereExists((query) => {
        query
          .from('platform_staff')
          .whereColumn('platform_staff.user_id', 'users.id')
          .whereNull('platform_staff.revoked_at')
      })
      .select('id')
    for (const row of rows) {
      await trx
        .from('users')
        .where('id', row.id)
        .update({ mfa_enabled_at: trx.raw('now()'), mfa_totp_secret_enc: placeholderCiphertext() })
    }
  }

  async #writeCredentials() {
    const file = {
      note: 'Development only (docs/09 §8.8). Sign in at /dev/sign-in; use this password for password re-entry.',
      password: this.password,
      accounts: DEMO_ACCOUNTS.map((account) => ({
        email: account.email,
        role: ROLES[account.key],
      })),
    }
    await mkdir(dirname(this.credentialsPath), { recursive: true })
    await writeFile(this.credentialsPath, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
    // writeFile sets the mode only when it creates the file.
    await chmod(this.credentialsPath, 0o600)
  }
}
