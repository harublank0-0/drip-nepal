/*
 * The theme choice of docs/08 §1.2, as the server and the client both read
 * it (docs/09 §13.10). It travels in the `dn_theme` cookie so the server
 * renders the right class before any JavaScript runs (RF-08). Anything
 * else, a missing cookie included, is `light`, the default.
 */
export const THEME_COOKIE = 'dn_theme'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

export function parseTheme(value: unknown): Theme {
  return (THEMES as readonly unknown[]).includes(value) ? (value as Theme) : 'light'
}
