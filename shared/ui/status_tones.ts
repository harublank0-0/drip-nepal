/*
 * The tones of `StatusBadge` (docs/08 §7.5, §5.2): for each entity it maps,
 * every state the 04a CHECK allows, with its tone. Labels live in
 * resources/lang/en/status.json under `<entity>.<state>`. T-UI-008 checks
 * each entity against its domain vocabulary and the catalog, so a new state
 * cannot ship without a label. Entities join with the pages that show them:
 * courier accounts since the admin courier pages (M6), shops since the
 * seller overview (R1-S part 1a).
 */
export type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'destructive'

export const STATUS_TONES = {
  courier_account: {
    pending: 'warning',
    active: 'success',
    invalid: 'destructive',
    suspended: 'destructive',
    disabled: 'neutral',
  },
  shop: {
    pending_review: 'warning',
    active: 'success',
    rejected: 'destructive',
    suspended: 'destructive',
    closed: 'neutral',
  },
} as const satisfies Record<string, Record<string, Tone>>

export type StatusEntity = keyof typeof STATUS_TONES

/** The tone of `state`, or null for a state the map does not know. */
export function toneOf(entity: StatusEntity, state: string): Tone | null {
  const tones: Record<string, Tone> = STATUS_TONES[entity]
  return Object.hasOwn(tones, state) ? tones[state] : null
}
