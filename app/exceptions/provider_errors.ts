/*
 * Errors a port adapter throws (docs/09 §5.1, docs/03 §11.2). They carry the
 * provider and the operation only, never the provider's payload, so logging
 * one cannot leak a customer's data or a credential.
 *
 * - `ProviderUnavailableError`: the provider is down or its breaker is open;
 *   retry later. The API answers 503 `PROVIDER_UNAVAILABLE` with `Retry-After: 30`.
 * - `ProviderTimeoutError`: no answer in time, so the outcome is unknown; the
 *   same 503 when it reaches the handler.
 * - `ProviderRejectedError`: a definitive refusal, which the action must catch
 *   and record; one that escapes answers 500 `INTERNAL`.
 * The job runner retries the first two and not the third (docs/03 §10.4).
 */
abstract class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly operation: string,
    message: string
  ) {
    super(`${provider} ${operation}: ${message}`)
    this.name = new.target.name
  }
}

export class ProviderUnavailableError extends ProviderError {
  constructor(provider: string, operation: string) {
    super(provider, operation, 'unavailable')
  }
}

export class ProviderTimeoutError extends ProviderError {
  constructor(provider: string, operation: string) {
    super(provider, operation, 'timed out')
  }
}

export class ProviderRejectedError extends ProviderError {
  constructor(provider: string, operation: string) {
    super(provider, operation, 'rejected')
  }
}
