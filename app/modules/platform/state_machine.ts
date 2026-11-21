import { InvalidStateTransition } from '#exceptions/domain_error'

/*
 * A transition table of docs/05 (§6.0 step 1): each machine lists its
 * allowed `[from, to]` pairs, and `assertTransition` throws
 * `InvalidStateTransition` (409, with the current status and the statuses
 * it may move to) for any other pair, before the compare-and-set.
 */
export type Machine<S extends string> = {
  name: string
  transitions: readonly (readonly [S, S])[]
}

export function defineMachine<S extends string>(
  name: string,
  transitions: readonly (readonly [S, S])[]
): Machine<S> {
  return { name, transitions }
}

export function allowedTargets<S extends string>(machine: Machine<S>, from: S): S[] {
  return machine.transitions.filter(([a]) => a === from).map(([, b]) => b)
}

export function canTransition<S extends string>(machine: Machine<S>, from: S, to: S) {
  return machine.transitions.some(([a, b]) => a === from && b === to)
}

export function assertTransition<S extends string>(machine: Machine<S>, from: S, to: S) {
  if (!canTransition(machine, from, to)) {
    throw new InvalidStateTransition(from, allowedTargets(machine, from))
  }
}
