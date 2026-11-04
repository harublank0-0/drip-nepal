/*
 * The photo to show where it is small (cards, cart and order lines,
 * category tiles): the 640 px WebP. A photo uploaded before photos were
 * resized has no 640 px file until `node ace media:optimize` runs, so it
 * falls back to the one file it has.
 */
export function smallPhotoUrl(
  media: { url: string; thumbnailUrl: string | null } | null | undefined
): string | null {
  return media ? (media.thumbnailUrl ?? media.url) : null
}
