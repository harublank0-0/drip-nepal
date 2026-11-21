import { courierConfig } from '#config/logistics'
import { NcmCourierProvider } from '#modules/logistics/providers/ncm'
import type { CourierProvider } from '#modules/logistics/providers/courier_provider'

/*
 * The courier adapters by provider code (docs/03 §11.1): built once from
 * configuration, and swapped by tests for a scripted fake without a code
 * branch. R1 has one adapter, Nepal Can Move (A-53).
 */
let providers: Map<string, CourierProvider> | null = null

function build() {
  return new Map<string, CourierProvider>([
    ['ncm', new NcmCourierProvider({ baseUrls: courierConfig.ncm })],
  ])
}

// The adapter of a provider code, or null for a courier with no adapter.
export function courierProvider(code: string): CourierProvider | null {
  providers ??= build()
  return providers.get(code) ?? null
}

// The provider codes that have an adapter.
export function courierProviderCodes(): string[] {
  providers ??= build()
  return [...providers.keys()]
}

// Tests only: replaces one adapter and returns the function that restores it.
export function swapCourierProvider(code: string, provider: CourierProvider) {
  providers ??= build()
  const previous = providers.get(code)
  providers.set(code, provider)
  return () => {
    if (previous) providers!.set(code, previous)
    else providers!.delete(code)
  }
}
