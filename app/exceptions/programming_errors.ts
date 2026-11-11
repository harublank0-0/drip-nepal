/*
 * Errors that mean a bug, not a user mistake (docs/09 §5.1). Both answer
 * 500 `INTERNAL`, are logged at `error` and go to the error tracker. Their
 * messages are for developers and never reach a client (RF-36).
 */

// A port adapter called while a `withTx` transaction is open (docs/03 §8.3); thrown in every environment.
export class ProviderCallInsideTransaction extends Error {
  constructor(adapter: string, method: string) {
    super(`${adapter}.${method} called inside a database transaction`)
    this.name = 'ProviderCallInsideTransaction'
  }
}

// A path that "cannot happen": an allocation that does not sum, an unknown enum from the database.
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvariantViolation'
  }
}
