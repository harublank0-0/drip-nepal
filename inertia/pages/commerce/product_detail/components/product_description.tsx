import { Link } from '@adonisjs/inertia/react'
import type { Data } from '@generated/data'
import type { ProductVariant } from '../hooks/use_variant_selection'

type ProductDescriptionProps = {
  product: Data.Product
  selectedVariant: ProductVariant | null
}

const GENDER_LABELS: Record<string, string> = {
  men: 'Men',
  women: 'Women',
  unisex: 'Unisex',
}

export function ProductDescription({ product, selectedVariant }: ProductDescriptionProps) {
  const description = product.description?.trim()

  return (
    <section
      aria-labelledby="product-description-heading"
      className="grid gap-10 py-10 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] md:gap-16 md:py-14"
    >
      <div>
        <h2 id="product-description-heading" className="mb-4 font-heading text-xl font-bold">
          Description
        </h2>
        {description ? (
          <p className="leading-relaxed whitespace-pre-line text-muted-foreground">{description}</p>
        ) : (
          <p className="text-muted-foreground">The shop hasn’t added a description yet.</p>
        )}
      </div>

      <div>
        <h2 className="mb-4 font-heading text-xl font-bold">Details</h2>
        <dl className="divide-y divide-border text-sm">
          {product.category && (
            <DetailRow label="Category">
              <Link
                route="categories.show"
                routeParams={{ slug: product.category.slug }}
                className="underline-offset-4 hover:underline"
              >
                {product.category.name}
              </Link>
            </DetailRow>
          )}
          <DetailRow label="Gender">{GENDER_LABELS[product.gender] ?? product.gender}</DetailRow>
          {product.brand && <DetailRow label="Brand">{product.brand}</DetailRow>}
          {selectedVariant && (
            <DetailRow label="SKU">
              <span className="font-mono text-xs">{selectedVariant.sku}</span>
            </DetailRow>
          )}
        </dl>
      </div>
    </section>
  )
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3 first:pt-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  )
}
