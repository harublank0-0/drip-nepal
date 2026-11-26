/*
 * The storefront's navigation entries (docs/04 §3.12, ADR-0014 decision 3;
 * 01 AC-FR-SRCH-007-1): fixed paths, each mapped to a listing filter of an
 * `audience` value and, below the audience pages, a category subtree. There
 * is no table and no catch-all route: a path outside this list answers 404.
 * The category is named by its slug, which survives a move in the tree; its
 * path, the subtree prefix of the listing query, is read when the page is
 * served. T-CAT-107 checks every entry against the seeded reference data, so
 * a renamed or removed category or value fails CI, not a page.
 *
 * R1-S (docs/12 §9 part 3): the two audience pages of docs/08 §2.2 and one
 * entry per top-level category and per popular leaf under each. The menu
 * changes by a reviewed code change, a few times a year.
 */
export type NavigationEntry = {
  // `/men` or `/men/{navSlug}`; lower case, no trailing slash.
  path: string
  // The menu label, such as "T-shirts".
  label: string
  // The page heading, such as "Men's T-shirts".
  title: string
  // A value code of the `audience` attribute.
  audience: string
  // A category slug whose subtree the entry lists, or null for the whole audience.
  categorySlug: string | null
}

/*
 * [navSlug, name as it reads after "Men's", category slug] under each
 * audience page. The menu label is the name with its first letter upper
 * case, so a name keeps its own capitals ("T-shirts").
 */
const MEN: readonly (readonly [string, string, string])[] = [
  ['clothing', 'clothing', 'clothing'],
  ['t-shirts', 'T-shirts', 't-shirts'],
  ['shirts', 'shirts', 'shirts'],
  ['hoodies', 'hoodies and sweatshirts', 'hoodies-sweatshirts'],
  ['jeans', 'jeans', 'jeans'],
  ['joggers', 'joggers and track pants', 'joggers'],
  ['traditional-wear', 'traditional wear', 'traditional-wear'],
  ['footwear', 'footwear', 'footwear'],
  ['sneakers', 'sneakers', 'sneakers'],
  ['bags', 'bags', 'bags'],
  ['watches', 'watches', 'watches'],
  ['accessories', 'accessories', 'accessories'],
]

const WOMEN: readonly (readonly [string, string, string])[] = [
  ['clothing', 'clothing', 'clothing'],
  ['tops', 'tops', 'tops'],
  ['dresses', 'dresses and jumpsuits', 'dresses-jumpsuits'],
  ['jeans', 'jeans', 'jeans'],
  ['traditional-wear', 'traditional wear', 'traditional-wear'],
  ['sarees', 'sarees', 'sarees'],
  ['kurtas', 'kurtas', 'kurtas'],
  ['footwear', 'footwear', 'footwear'],
  ['sneakers', 'sneakers', 'sneakers'],
  ['bags', 'bags', 'bags'],
  ['watches', 'watches', 'watches'],
  ['accessories', 'accessories', 'accessories'],
]

function audiencePage(
  audience: string,
  title: string,
  entries: readonly (readonly [string, string, string])[]
): NavigationEntry[] {
  return [
    { path: `/${audience}`, label: title, title, audience, categorySlug: null },
    ...entries.map(([navSlug, name, categorySlug]) => ({
      path: `/${audience}/${navSlug}`,
      label: `${name.charAt(0).toUpperCase()}${name.slice(1)}`,
      title: `${title}'s ${name}`,
      audience,
      categorySlug,
    })),
  ]
}

export const NAVIGATION: readonly NavigationEntry[] = [
  ...audiencePage('men', 'Men', MEN),
  ...audiencePage('women', 'Women', WOMEN),
]

const BY_PATH = new Map(NAVIGATION.map((entry) => [entry.path, entry]))

// The entry of a path, or null: the caller answers 404 (AC-FR-SRCH-007-1).
export function navigationEntry(path: string): NavigationEntry | null {
  return BY_PATH.get(path) ?? null
}
