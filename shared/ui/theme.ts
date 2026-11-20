/*
 * The theme choice of docs/08 §1.2, as the server and the client both read
 * it (docs/09 §13.10). It travels in the `dn_theme` cookie so the server
 * renders the right class before any JavaScript runs (RF-08). Anything
 * else, a missing cookie included, is `light`, the default.
 */
export const THEME_COOKIE = 'dn_theme'

export const THEMES = ['light', 'dark', 'system'] as const
export type Theme = (typeof THEMES)[number]

// The browser chrome colour of each theme (the theme-color meta tag): the
// `--background` token of inertia/css/app.css in sRGB, `oklch(1 0 0)` and
// `oklch(0.141 0.005 285.823)`. The root view writes the same values.
export const THEME_COLORS = { light: '#ffffff', dark: '#09090b' } as const

export function parseTheme(value: unknown): Theme {
  return (THEMES as readonly unknown[]).includes(value) ? (value as Theme) : 'light'
}
