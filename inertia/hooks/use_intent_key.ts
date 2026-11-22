import { useRef } from 'react'

/*
 * One `Idempotency-Key` per intent (docs/06 §7.1, docs/09 §13.4): `for(body)`
 * returns the same UUID while the body is unchanged, so a retry replays, and a
 * new one when the body changes; `reset()` after a success starts a new
 * intent. Called in submit handlers, never during render (SSR rule 2).
 */
export function useIntentKey<Body>() {
  const current = useRef<{ body: string; key: string } | null>(null)
  return {
    for(body: Body) {
      const canonical = JSON.stringify(body)
      if (current.current?.body !== canonical) {
        current.current = { body: canonical, key: crypto.randomUUID() }
      }
      return current.current.key
    },
    reset() {
      current.current = null
    },
  }
}
