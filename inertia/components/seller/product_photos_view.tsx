import type { AttributeOption, SellerProduct } from '@shared/ui/product_details'
import { altFallback, colourLabel, galleryFrom } from '@shared/ui/product_media'
import { t } from '~/lib/i18n'
import { PhotoThumb } from '~/components/seller/photo_thumb'

/*
 * The product's photos as saved, for a role or a product that cannot change
 * them (docs/08 §2.5 `/products/{productId}`; R1-S part 2g-ii): each image
 * in order with its alt text, or the storefront's fallback for none, the
 * first marked as the main photo.
 */
export function ProductPhotosView({
  product,
  attributes,
  mediaBase,
}: {
  product: SellerProduct
  attributes: AttributeOption[]
  mediaBase: string
}) {
  const items = galleryFrom(product)
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('seller.photos.none')}</p>
  }
  return (
    <ol
      className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      aria-label={t('seller.photos.gallery_label')}
    >
      {items.map((item, index) => {
        return (
          <li key={item.assetId} className="space-y-1">
            <PhotoThumb
              keys={item.keys}
              mediaBase={mediaBase}
              alt={
                item.alt.trim() ||
                altFallback(product.title, colourLabel(attributes, item.colorValueId))
              }
              sizes="(min-width: 640px) 25vw, 50vw"
              className="aspect-square w-full rounded object-cover"
            />
            <p className="text-xs">
              {t('seller.photos.position', { position: index + 1 })}
              {index === 0 && ` · ${t('seller.photos.main')}`}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
