/*
 * An image as `<img>` takes it (docs/06 §14.1, 03 §3.5): every derived
 * width in `srcset` and a fallback `src` (the widest at most 640 px, else
 * the narrowest), from the public bucket's base URL (`MEDIA_PUBLIC_URL`,
 * docs/09 §6.1) and the asset's keys by width. Shared so the storefront's
 * page props and the seller editor, which builds them in the browser from
 * the keys the JSON API carries, give the same URLs (R1-S part 2g-i).
 */
export function imageSources(keys: Record<string, string>, mediaBase: string) {
  // No public store set up (tests): no URL, rather than a path on this site.
  if (mediaBase === '') return { src: '', srcset: '' }
  const base = mediaBase.replace(/\/$/, '')
  const widths = Object.entries(keys)
    .map(([width, key]) => ({ width: Number(width), url: `${base}/${key}` }))
    .sort((a, b) => a.width - b.width)
  const fallback = widths.filter((item) => item.width <= 640).at(-1) ?? widths[0]
  return {
    src: fallback?.url ?? '',
    srcset: widths.map((item) => `${item.url} ${item.width}w`).join(', '),
  }
}
