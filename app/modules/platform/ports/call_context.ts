/*
 * What every port call receives (docs/03 §11.1): the request it serves, for
 * the `provider.call` log line, and a time limit. Adapters never take a
 * transaction.
 */
export type CallContext = {
  requestId: string | null
  timeoutMs: number
  signal?: AbortSignal
}
