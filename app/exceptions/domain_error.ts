import { Exception } from '@adonisjs/core/exceptions'
import { PROBLEM_CODES, isProposed, type ProblemCode } from '#exceptions/problem_codes'
import { InvariantViolation } from '#exceptions/programming_errors'

/*
 * One reason of a problem's `errors[]` (docs/06 §5.1): `field` is a dotted
 * path or null, `code` a rule name or business reason, plus the optional
 * members 06 §5.1 lists (`available`, `on_hand`, `reserved`, `cart_item_id`,
 * the `below_reserved` members).
 */
export type ProblemErrorItem = {
  field: string | null
  code: string
  message: string
} & Record<string, string | number | string[] | null>

export type DomainErrorOptions = {
  // Plain English for the end user; never an exception's message (ADR-0018 decision 5).
  detail?: string
  errors?: ProblemErrorItem[]
  // Only the snake_case members listed in docs/06 §5.1.
  extensions?: Record<string, unknown>
  retryAfterSeconds?: number
  cause?: unknown
}

/*
 * The error actions, policies and middleware throw (docs/09 §5.1, §5.3). Its
 * message is the code's fixed title, so a path that logs or renders
 * `error.message` shows nothing more. It deliberately has no `handle()`: the
 * framework calls an error's own `handle()` first, which would bypass the
 * single translation point in app/exceptions/handler.ts.
 */
export class DomainError extends Exception {
  readonly problemCode: ProblemCode
  readonly options: DomainErrorOptions

  constructor(code: ProblemCode, options: DomainErrorOptions = {}) {
    // A proposed code is not adopted yet, so no code may throw it (docs/09 §5.2).
    if (isProposed(code)) throw new InvariantViolation(`${code} is a proposed problem code`)
    super(PROBLEM_CODES[code].title, {
      code,
      status: PROBLEM_CODES[code].status,
      cause: options.cause,
    })
    this.problemCode = code
    this.options = options
  }
}

// A transition the resource's current state does not allow (docs/05 tables).
export class InvalidStateTransition extends DomainError {
  constructor(currentStatus: string, allowedEvents: string[]) {
    super('INVALID_STATE_TRANSITION', {
      extensions: { current_status: currentStatus, allowed_events: allowedEvents },
    })
  }
}

// A version compare-and-set that changed no row on an `If-Match` request (docs/06 §8).
export class VersionConflict extends DomainError {
  // `current` is the resource as the read operation's transformer renders it.
  constructor(current: Record<string, unknown>) {
    super('VERSION_CONFLICT', { extensions: { current } })
  }
}
