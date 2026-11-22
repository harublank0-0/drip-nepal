import { useEffect } from 'react'
import { usePage } from '@inertiajs/react'

/*
 * The focus rule of docs/08 §9.1 for client-side navigation: after a visit
 * to another page (a new component or a new path), focus moves to the new
 * page's `<h1>` inside `<main id="main">`, which each page gives
 * `tabIndex={-1}`, so a screen reader reads where the user has arrived. A
 * query-only change, such as `/verify-email` dropping its token, keeps
 * focus where it is, and so does the first page of a load. Focusing the
 * heading is the announcement (08 §11.7 rule 4).
 *
 * Each surface layout calls it. The last place is kept for the whole tab,
 * not per layout, because a visit between surfaces (the sign-up page's
 * footer to a legal page) mounts a new layout. It is written in an effect
 * only, so the server render never touches it (docs/09 §13.8 rule 1).
 */
const lastSeen: { place: string | null } = { place: null }

export function useHeadingFocus() {
  const { component, url } = usePage()
  const place = `${component} ${url.split('?')[0]}`
  useEffect(() => {
    if (lastSeen.place !== null && lastSeen.place !== place) {
      document.querySelector<HTMLElement>('#main h1')?.focus()
    }
    lastSeen.place = place
  }, [place])
}
