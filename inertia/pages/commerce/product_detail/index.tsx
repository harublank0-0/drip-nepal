import type { InertiaProps } from '~/types'
import type { Data } from '@generated/data'
import { ProductMediaGallery } from './components/product_media_gallery/index'
import { ProductDesc } from '~/pages/commerce/product_detail/components/product_desc'

type PageProps = InertiaProps<{}>

const PRODUCT_DESC = {
  title: 'UNISEX 2 PACK RELAXED FIT HOODIE - Hoodie - beige/turquoise',
  price: {
    currency: 'Rs',
    listAmount: 499,
    sellingPrice: 400,
  },
  variants: {
    colors: [
      {
        color: 'beige/turquoise',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/05669b61005f44f6ae7add976256df45/c1399a059ca7418eb25ae18f863f6980.jpg?imwidth=156&filter=packshot',
      },
      {
        color: 'black',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/000fe4b97a1c4008ad1f53fbbf83bdae/0cbff5c62ec94fb681065e107e2ca9b2.jpg?imwidth=156&filter=packshot',
      },
      {
        color: 'motteled gray',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/b7b3c72b5e3144a29f13e68400c9c415/c20f630c1fe84dfaac37a767c7562803.jpg?imwidth=156&filter=packshot',
      },

      {
        color: 'moonbeam',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/55b75746b5e9415dbea30f4167df6c80/a2b18fa62877439798b5a7b5fdfd5109.jpg?imwidth=156&filter=packshot',
      },
      {
        color: 'beige/turquoise',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/05669b61005f44f6ae7add976256df45/c1399a059ca7418eb25ae18f863f6980.jpg?imwidth=156&filter=packshot',
      },
      {
        color: 'black',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/000fe4b97a1c4008ad1f53fbbf83bdae/0cbff5c62ec94fb681065e107e2ca9b2.jpg?imwidth=156&filter=packshot',
      },
      {
        color: 'motteled gray',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/b7b3c72b5e3144a29f13e68400c9c415/c20f630c1fe84dfaac37a767c7562803.jpg?imwidth=156&filter=packshot',
      },

      {
        color: 'moonbeam',
        thumbnailUrl:
          'https://img01.ztat.net/article/spp-media-p1/55b75746b5e9415dbea30f4167df6c80/a2b18fa62877439798b5a7b5fdfd5109.jpg?imwidth=156&filter=packshot',
      },
    ],
    sizes: [
      {
        label: 'small',
        slug: 'sm',
      },
      {
        label: 'medium',
        slug: 'm',
      },
      {
        label: 'large',
        slug: 'l',
      },
    ],
  },
}

export default function Index({}: PageProps) {
  return (
    <div className="container mx-auto">
      <div className="flex gap-4 flex-col lg:flex-row">
        <div className="flex-1 lg:basis-1/2">
          <ProductMediaGallery />
        </div>

        <div className="flex-1 lg:basis-1/2">
          <ProductDesc {...PRODUCT_DESC} />
        </div>
      </div>
    </div>
  )
}
