import { useEffect, useRef, useState } from 'react'
import { router } from '@inertiajs/react'
import { urlFor } from '~/client'
import { announce } from '~/lib/announce'
import { t } from '~/lib/i18n'
import { Field, FieldDescription, FieldLabel } from '~/components/ui/field'
import { Input } from '~/components/ui/input'
import { ChoiceField } from '~/components/forms/choice_field'

/*
 * The filters of `/seller/{shopSlug}/products` (docs/08 §7.2; 06 §6.3
 * `listShopProducts`; R1-S part 2f-i): the status, and a search on a title
 * or SKU prefix. The URL is the state, with exactly the operation's
 * parameter names (`status`, `q`): each change visits the page again with a
 * partial reload of the list, replacing the history entry, so Back leaves
 * the list instead of undoing each filter; the cursor is dropped. The search
 * waits 300 ms after the last key and runs only for 0 or at least 2
 * characters (a client rule, 08 §7.2 [Assumption]), and takes at most
 * 100 (06 §6.3). Each change builds on the filters last asked for, so a
 * change made while another visit is in flight never undoes it. The new
 * count is announced politely ("12 products shown", 08 §7.4).
 */
export const PRODUCT_STATUS_FILTERS = [
  'draft',
  'pending_review',
  'published',
  'unpublished',
  'rejected',
  'archived',
  'blocked',
] as const

type StatusFilter = (typeof PRODUCT_STATUS_FILTERS)[number]

// The status choice for "every product but the archived ones", the list's default.
const NOT_ARCHIVED = 'not_archived'
const SEARCH_DELAY_MS = 300
// `q`'s bound on seller lists (06 §6.3); a longer term would be refused.
const SEARCH_MAX = 100

export function ProductFilters({
  shopSlug,
  status,
  q,
}: {
  shopSlug: string
  status: string | null
  q: string | null
}) {
  const [search, setSearch] = useState(q ?? '')
  // The search this box last sent, and the URL's search as last rendered.
  const [sent, setSent] = useState(q)
  const [seen, setSeen] = useState(q)
  const timer = useRef<number | null>(null)
  // The filters last asked for, which a visit still in flight has not brought back yet:
  // the search timer and the status choice build on these, not on the values of an older render.
  const chosen = useRef({ status, q })
  // A search the URL brought by another way (a link, a reload) replaces the box's text;
  // the answer to the box's own search leaves alone what was typed since.
  if (q !== seen) {
    setSeen(q)
    if (q !== sent) {
      setSent(q)
      setSearch(q ?? '')
    }
  }

  // A new URL state (a link, Back) is what the next change builds on.
  useEffect(() => {
    chosen.current = { status, q }
  }, [status, q])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    []
  )

  function visit(next: { status: string | null; q: string | null }) {
    const query: Record<string, string> = {}
    if (next.status) query.status = next.status
    if (next.q) query.q = next.q
    chosen.current = next
    setSent(next.q)
    router.get(urlFor('seller.products', { shopSlug }), query, {
      preserveState: true,
      preserveScroll: true,
      replace: true,
      only: ['products', 'filters'],
      onSuccess: (page) => {
        const products = page.props.products as { items: unknown[] }
        announce(t('seller.products.shown', { count: products.items.length }))
      },
    })
  }

  function onSearch(value: string) {
    setSearch(value)
    if (timer.current !== null) window.clearTimeout(timer.current)
    const term = value.trim()
    if (term.length === 1) return
    timer.current = window.setTimeout(() => {
      timer.current = null
      const last = chosen.current
      if (term !== (last.q ?? '')) visit({ status: last.status, q: term === '' ? null : term })
    }, SEARCH_DELAY_MS)
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ChoiceField<StatusFilter | typeof NOT_ARCHIVED>
        id="products-status"
        label={t('seller.products.filter_status')}
        value={(status as StatusFilter | null) ?? NOT_ARCHIVED}
        options={[
          { value: NOT_ARCHIVED, label: t('seller.products.filter_not_archived') },
          ...PRODUCT_STATUS_FILTERS.map((value) => ({
            value,
            label: t(`status.product.${value}` as Parameters<typeof t>[0]),
          })),
        ]}
        triggerClassName="data-[size=default]:h-11 text-base md:text-sm"
        errors={[]}
        onChange={(value) =>
          visit({ status: value === NOT_ARCHIVED ? null : value, q: chosen.current.q })
        }
      />
      <Field>
        <FieldLabel htmlFor="products-search">{t('seller.products.search')}</FieldLabel>
        <Input
          id="products-search"
          type="search"
          value={search}
          maxLength={SEARCH_MAX}
          autoComplete="off"
          aria-describedby="products-search-help"
          className="h-11 text-base md:text-sm"
          onChange={(event) => onSearch(event.target.value)}
        />
        <FieldDescription id="products-search-help">
          {t('seller.products.search_help')}
        </FieldDescription>
      </Field>
    </div>
  )
}
