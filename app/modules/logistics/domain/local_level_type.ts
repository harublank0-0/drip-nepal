/*
 * `local_levels.type` (docs/04a §9.3): the values of
 * `local_levels_type_check`, in its order. T-ARCH-011 fails if the two differ
 * (docs/04 §2.4).
 */
export const LOCAL_LEVEL_TYPES = [
  'metropolitan',
  'sub_metropolitan',
  'municipality',
  'rural_municipality',
] as const
export type LocalLevelType = (typeof LOCAL_LEVEL_TYPES)[number]
