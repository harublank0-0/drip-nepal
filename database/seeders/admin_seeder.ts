import { BaseSeeder } from '@adonisjs/lucid/seeders'
import GlobalRole from '#models/global_role'
import User from '#models/user'
import { GlobalRoles } from '#constants/global_roles'

/*
 * Gives a platform admin role to an existing user:
 *
 *   ADMIN_EMAIL=someone@example.com node ace db:seed --files=database/seeders/admin_seeder.ts
 *
 * The user signs up normally first. Does nothing when ADMIN_EMAIL isn't set.
 */
export default class extends BaseSeeder {
  async run() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
    if (!email) return

    const user = await User.findBy('email', email)
    if (!user) {
      throw new Error(`No user with email ${email}. Sign up first, then run this seeder.`)
    }

    const role = await GlobalRole.firstOrCreate({ slug: GlobalRoles.ADMIN.slug }, GlobalRoles.ADMIN)
    await user.related('roles').sync([role.id], false)
    console.log(`${user.email} is now an admin`)
  }
}
