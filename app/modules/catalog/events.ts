/*
 * The queues the `catalog` module hosts (docs/03 §9; payloads carry
 * identifiers only, docs/04a §15.5). Senders reach them by name through
 * `sendJob`.
 *
 * - `catalog.refresh_listing`: recomputes one product's `product_listings`
 *   row from the source tables (docs/04a §7.12). Sent by every write to a
 *   product, drafts included, without a `singletonKey` (docs/09 §12.2
 *   decision 3).
 * - `catalog.rebuild_listings`: daily, refreshes every product that is
 *   published or still listed (R1-S part 2e-i).
 */
declare module '#modules/platform/jobs' {
  interface JobPayloads {
    'catalog.refresh_listing': { product_id: string }
    'catalog.rebuild_listings': Record<string, never>
    'catalog.generate_sitemap': Record<string, never>
  }
}

export {}
