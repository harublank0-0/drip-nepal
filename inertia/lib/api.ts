import { TuyauHTTPError } from '@tuyau/core/client'
import { fallbackProblem, isProblem, type Problem } from '@shared/api/problem'

/*
 * Every /api/v1 write goes through `apiCall` (docs/09 §13.4, docs/06 §5.4),
 * so a failure has one shape: a problem, or offline for a network failure or
 * timeout. `IDEMPOTENCY_IN_PROGRESS` is retried with the same `send`, which
 * reuses the same `Idempotency-Key`, so the retry replays (06 §7.4).
 */
export type ApiOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; problem: Problem }
  | { ok: false; offline: true }

const MAX_IN_PROGRESS_RETRIES = 3 // docs/08 §8.3 [Assumption]

const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000))

export async function apiCall<T>(send: () => Promise<T>): Promise<ApiOutcome<T>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return { ok: true, data: await send() }
    } catch (error) {
      if (!(error instanceof TuyauHTTPError)) return { ok: false, offline: true }
      const problem = isProblem(error.response) ? error.response : fallbackProblem(error.status)
      if (problem.code === 'IDEMPOTENCY_IN_PROGRESS' && attempt < MAX_IN_PROGRESS_RETRIES) {
        await wait(problem.retry_after_seconds ?? 2)
        continue
      }
      return { ok: false, problem }
    }
  }
}
