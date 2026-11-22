import { LIVE_REGION_IDS } from '~/lib/announce'

/*
 * The two live regions of docs/08 §7.4, rendered empty by the root layout
 * on the server and in the browser, so they exist before `announce`
 * (inertia/lib/announce.ts) writes into them. React renders no children
 * here, so it never overwrites what `announce` wrote.
 */
export function LiveRegions() {
  return (
    <>
      <div id={LIVE_REGION_IDS.polite} aria-live="polite" aria-atomic="true" className="sr-only" />
      <div
        id={LIVE_REGION_IDS.assertive}
        aria-live="assertive"
        aria-atomic="true"
        className="sr-only"
      />
    </>
  )
}
