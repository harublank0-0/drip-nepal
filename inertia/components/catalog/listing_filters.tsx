import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { minorToRupeesText, parseRupeesToMinor } from '@shared/format/money'
import {
  LISTING_DEFAULT_PER_PAGE,
  toggleBrand,
  toggleValue,
  type ListingUrlState,
} from '@shared/ui/listing_url'
import { t } from '~/lib/i18n'
import { MoneyInput } from '~/components/forms/money_input'

/*
 * The listing's filter panel (docs/08 §4.3 `FilterBar`, §11.1, §9; 01
 * AC-FR-SRCH-001-1 and -6; R1-S part 3d-i-b), in the desktop sidebar and
 * the phone sheet. It is a real `<form method="get">` whose inputs carry
 * the allowlisted names (06 §6.3), so without JavaScript it submits a
 * correct URL with its Apply button; with it, each change is a filter visit
 * and the form never submits.
 *
 * - On `/search` only, the category (the path carries it elsewhere): the
 *   top-level categories, and the children of each one on the way to the
 *   chosen one. A page whose path sets the audience offers no audience.
 * - The attribute values the page's category may use, with colour
 *   swatches; the brands of listed products.
 * - The price in rupees, two number inputs (no slider is needed, SC 2.5.7),
 *   applied when a field is left or Enter is pressed in it, turned into paisa
 *   with `parseRupeesToMinor`. An amount it cannot read, or a maximum below
 *   the minimum, shows an inline error and is not applied (J-01). The
 *   rupee fields have no name: hidden fields send the applied paisa
 *   without JavaScript. The slider of 08 §4.3 waits for a read of the
 *   listing's price range.
 * - In stock only.
 */
export type Facet = {
  code: string
  name: string
  input: string
  values: { code: string; label: string; swatch_hex: string | null }[]
}
export type BrandOption = { slug: string; name: string }
export type CategoryOption = { slug: string; name: string; children: CategoryOption[] }

type Update = (state: ListingUrlState) => ListingUrlState | null

// The categories from a root down to `slug`, or null when it is not in the tree.
export function categoryTrail(nodes: CategoryOption[], slug: string): CategoryOption[] | null {
  for (const node of nodes) {
    if (node.slug === slug) return [node]
    const below = categoryTrail(node.children, slug)
    if (below) return [node, ...below]
  }
  return null
}

const rupees = (minor: number | null) => (minor === null ? '' : minorToRupeesText(minor))

function Group({ legend, children }: { legend: string; children: ReactNode }) {
  return (
    <fieldset className="border-b pb-4 last:border-b-0">
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      {children}
    </fieldset>
  )
}

function Choice({
  type,
  name,
  value,
  checked,
  onChange,
  children,
}: {
  type: 'checkbox' | 'radio'
  name: string
  value: string
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
}) {
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2 text-sm">
      <input
        type={type}
        name={name}
        value={value}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-primary size-4 shrink-0"
      />
      {children}
    </label>
  )
}

export function ListingFilters({
  id,
  path,
  state,
  facets,
  brands,
  categories,
  searchField,
  onChange,
  onSubmitted,
  footer,
}: {
  id: string
  path: string
  state: ListingUrlState
  facets: Facet[]
  brands: BrandOption[]
  // Empty where the path carries the category.
  categories: CategoryOption[]
  // Whether the toolbar's search field sends `q`; else a hidden field keeps it.
  searchField: boolean
  onChange: (update: Update) => boolean
  /*
   * After the form is submitted (the phone sheet's "Show" button submits
   * it): the typed price is applied first, and when it cannot be, focus
   * moves to the field with the error and this is not called.
   */
  onSubmitted?: () => void
  footer?: ReactNode
}) {
  /*
   * The price as typed. A price applied elsewhere (a chip removed, Clear
   * all, Back) replaces it; the one this panel applied leaves alone what
   * is being typed in the other field.
   */
  const priceKey = `${state.priceMinMinor}:${state.priceMaxMinor}`
  const [priceSeen, setPriceSeen] = useState(priceKey)
  const [priceApplied, setPriceApplied] = useState(priceKey)
  const [minText, setMinText] = useState(rupees(state.priceMinMinor))
  const [maxText, setMaxText] = useState(rupees(state.priceMaxMinor))
  const [priceErrors, setPriceErrors] = useState<{ min?: string; max?: string }>({})
  if (priceKey !== priceSeen) {
    setPriceSeen(priceKey)
    if (priceKey !== priceApplied) {
      setPriceApplied(priceKey)
      setMinText(rupees(state.priceMinMinor))
      setMaxText(rupees(state.priceMaxMinor))
      setPriceErrors({})
    }
  }

  // Whether the typed price could be applied (or was empty).
  function applyPrice() {
    const min = minText.trim() === '' ? null : parseRupeesToMinor(minText)
    const max = maxText.trim() === '' ? null : parseRupeesToMinor(maxText)
    const errors: { min?: string; max?: string } = {}
    if (minText.trim() !== '' && min === null) errors.min = t('storefront.filters.price_invalid')
    if (maxText.trim() !== '' && max === null) errors.max = t('storefront.filters.price_invalid')
    if (min !== null && max !== null && min > max) errors.max = t('storefront.filters.price_order')
    setPriceErrors(errors)
    if (errors.min || errors.max) return false
    setPriceApplied(`${min}:${max}`)
    onChange((current) =>
      current.priceMinMinor === min && current.priceMaxMinor === max
        ? null
        : { ...current, priceMinMinor: min, priceMaxMinor: max }
    )
    return true
  }

  // With two text fields and no submit button the browser never submits on Enter: these do.
  function applyOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    applyPrice()
  }

  const trail = state.category === null ? [] : (categoryTrail(categories, state.category) ?? [])
  const open = new Set(trail.map((node) => node.slug))
  function categoryLevel(nodes: CategoryOption[], depth: number): ReactNode {
    return (
      <ul className={depth > 0 ? 'ms-6' : undefined}>
        {nodes.map((node) => (
          <li key={node.slug}>
            <Choice
              type="radio"
              name="category"
              value={node.slug}
              checked={state.category === node.slug}
              onChange={() =>
                onChange((current) =>
                  current.category === node.slug ? null : { ...current, category: node.slug }
                )
              }
            >
              {node.name}
            </Choice>
            {open.has(node.slug) && node.children.length > 0
              ? categoryLevel(node.children, depth + 1)
              : null}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <form
      id={id}
      method="get"
      action={path}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        const form = event.currentTarget
        if (applyPrice()) {
          onSubmitted?.()
        } else {
          // Once the error is rendered.
          window.requestAnimationFrame(() =>
            form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
          )
        }
      }}
    >
      {categories.length > 0 ? (
        <Group legend={t('storefront.filters.category')}>
          <Choice
            type="radio"
            name="category"
            value=""
            checked={state.category === null}
            onChange={() =>
              onChange((current) =>
                current.category === null ? null : { ...current, category: null }
              )
            }
          >
            {t('storefront.filters.all_categories')}
          </Choice>
          {categoryLevel(categories, 0)}
        </Group>
      ) : null}
      {facets
        .filter((facet) => facet.values.length > 0)
        .map((facet) => (
          <Group key={facet.code} legend={facet.name}>
            <ul className={facet.code === 'color' ? undefined : 'grid grid-cols-2 gap-x-2'}>
              {facet.values.map((value) => (
                <li key={value.code}>
                  <Choice
                    type="checkbox"
                    name={facet.code}
                    value={value.code}
                    checked={(state.values[facet.code] ?? []).includes(value.code)}
                    onChange={(on) =>
                      onChange((current) => toggleValue(current, facet.code, value.code, on))
                    }
                  >
                    {value.swatch_hex ? (
                      <span
                        aria-hidden="true"
                        className="size-4 shrink-0 rounded-full border"
                        style={{ backgroundColor: value.swatch_hex }}
                      />
                    ) : null}
                    {value.label}
                  </Choice>
                </li>
              ))}
            </ul>
          </Group>
        ))}
      {brands.length > 0 ? (
        <Group legend={t('storefront.filters.brand')}>
          <ul>
            {brands.map((brand) => (
              <li key={brand.slug}>
                <Choice
                  type="checkbox"
                  name="brand"
                  value={brand.slug}
                  checked={state.brand.includes(brand.slug)}
                  onChange={(on) => onChange((current) => toggleBrand(current, brand.slug, on))}
                >
                  {brand.name}
                </Choice>
              </li>
            ))}
          </ul>
        </Group>
      ) : null}
      <Group legend={t('storefront.filters.price')}>
        <div className="grid grid-cols-2 gap-2">
          <MoneyInput
            id={`${id}-price-min`}
            label={t('storefront.filters.price_min')}
            value={minText}
            onChange={setMinText}
            onBlur={applyPrice}
            onKeyDown={applyOnEnter}
            unnamed
            errors={priceErrors.min ? [priceErrors.min] : []}
          />
          <MoneyInput
            id={`${id}-price-max`}
            label={t('storefront.filters.price_max')}
            value={maxText}
            onChange={setMaxText}
            onBlur={applyPrice}
            onKeyDown={applyOnEnter}
            unnamed
            errors={priceErrors.max ? [priceErrors.max] : []}
          />
        </div>
        {state.priceMinMinor === null ? null : (
          <input type="hidden" name="price_min_minor" value={state.priceMinMinor} />
        )}
        {state.priceMaxMinor === null ? null : (
          <input type="hidden" name="price_max_minor" value={state.priceMaxMinor} />
        )}
      </Group>
      <Group legend={t('storefront.filters.availability')}>
        <Choice
          type="checkbox"
          name="in_stock"
          value="true"
          checked={state.inStock}
          onChange={(on) =>
            onChange((current) => (current.inStock === on ? null : { ...current, inStock: on }))
          }
        >
          {t('storefront.filters.in_stock')}
        </Choice>
      </Group>
      {!searchField && state.q !== null ? <input type="hidden" name="q" value={state.q} /> : null}
      {state.perPage === LISTING_DEFAULT_PER_PAGE ? null : (
        <input type="hidden" name="per_page" value={state.perPage} />
      )}
      <noscript>
        <button
          type="submit"
          className="bg-primary text-primary-foreground h-10 w-full rounded-md text-sm font-medium"
        >
          {t('storefront.filters.apply')}
        </button>
      </noscript>
      {footer}
    </form>
  )
}
