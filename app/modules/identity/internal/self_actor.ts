import type { QueryClientContract } from '@adonisjs/lucid/types/database'

/*
 * The actor of an audit row a user writes about their own account
 * (docs/04a §15.3): staff with their role when the user holds an
 * unrevoked `platform_staff` row, anyone else a customer. `logIn`,
 * `resetPassword`, `changePassword`, `revokeAllSessions` and a wrong
 * password re-entry of `changePassword` use it.
 */
export type SelfActor =
  | { actorType: 'platform_staff'; actorRole: string }
  | { actorType: 'customer'; actorRole: null }

export async function selfActor(client: QueryClientContract, userId: string): Promise<SelfActor> {
  const staff = await client
    .from('platform_staff')
    .where('user_id', userId)
    .whereNull('revoked_at')
    .select('role')
    .first()
  return staff
    ? { actorType: 'platform_staff', actorRole: `platform:${staff.role}` }
    : { actorType: 'customer', actorRole: null }
}
