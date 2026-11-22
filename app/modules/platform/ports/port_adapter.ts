import { ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import { insideTransaction } from '#modules/platform/tx'

/*
 * The base of every adapter behind a port (docs/09 §3.8, docs/03 §11.1):
 * `guard(operation)` throws `ProviderCallInsideTransaction` when a `withTx`
 * transaction is open, in every environment, so no provider call ever runs
 * while row locks are held (docs/03 §11.4, T-ARCH-003).
 */
export abstract class PortAdapter {
  protected abstract readonly adapterName: string

  protected guard(operation: string) {
    if (insideTransaction()) throw new ProviderCallInsideTransaction(this.adapterName, operation)
  }
}
