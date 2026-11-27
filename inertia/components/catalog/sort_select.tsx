import { defaultSort } from '@shared/ui/listing_url'
import { t } from '~/lib/i18n'

/*
 * The listing's sort control (docs/08 §11.1; 06 §6.3 `sort`; R1-S part
 * 3d-i-b): a native `<select name="sort">` tied to the filter form by
 * `form`, so the form submits it without JavaScript; with it, a change is a
 * filter visit. Best match is offered only with a search, the only time
 * the server takes it.
 */
const SORT_LABELS = {
  relevance: 'storefront.sort.relevance',
  newest: 'storefront.sort.newest',
  price_asc: 'storefront.sort.price_asc',
  price_desc: 'storefront.sort.price_desc',
} as const

type Sort = keyof typeof SORT_LABELS

export function SortSelect({
  id,
  form,
  q,
  sort,
  onChange,
}: {
  id: string
  form: string
  q: string | null
  sort: string | null
  onChange: (sort: string) => void
}) {
  const sorts: Sort[] =
    q === null
      ? ['newest', 'price_asc', 'price_desc']
      : ['relevance', 'newest', 'price_asc', 'price_desc']
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="text-muted-foreground text-sm whitespace-nowrap">
        {t('storefront.sort.label')}
      </label>
      <select
        id={id}
        name="sort"
        form={form}
        value={sort ?? defaultSort(q)}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm outline-none focus-visible:ring-3 dark:bg-input/30"
      >
        {sorts.map((value) => (
          <option key={value} value={value}>
            {t(SORT_LABELS[value])}
          </option>
        ))}
      </select>
    </div>
  )
}
