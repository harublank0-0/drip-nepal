/*
 * The one date and time format of the UI (docs/08 §11.8): RFC 3339 UTC in,
 * Kathmandu time out (UTC+05:45, no daylight saving), with the zone always
 * passed, so the server (TZ=UTC) and the browser print the same text.
 */
const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'Asia/Kathmandu',
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function formatDateTime(iso: string) {
  return DATE_TIME.format(new Date(iso))
}
