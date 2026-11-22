/*
 * The status changes the admin page offers for a courier account (docs/08
 * §3.1 "Courier operations"), mirroring `setLogisticsAccountStatus`: suspend
 * an account that is neither suspended nor disabled, resume (back to
 * `pending`, so NCM checks it again) a suspended one, disable any but a
 * disabled one. The UI hides; the server decides (docs/08 §11.6).
 */
export type StatusChange = 'suspended' | 'pending' | 'disabled'

export function allowedChanges(status: string): StatusChange[] {
  const changes: StatusChange[] = []
  if (status !== 'suspended' && status !== 'disabled') changes.push('suspended')
  if (status === 'suspended') changes.push('pending')
  if (status !== 'disabled') changes.push('disabled')
  return changes
}
