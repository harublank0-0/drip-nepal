import type { InertiaProps } from '~/types'
import type { Data } from '@generated/data'
import { ProductMediaGallery } from './components/product_media_gallery/index'
import { Typography } from '~/components/ui/typography'

type PageProps = InertiaProps<{}>

export default function Index({}: PageProps) {
  return (
    <div className="container mx-auto">
      <div className="flex gap-4 flex-col lg:flex-row">
        <div className="flex-1 lg:basis-1/2">
          <ProductMediaGallery />
        </div>

        <div className="flex-1 lg:basis-1/2">
          <Typography.H1> Products details </Typography.H1>
        </div>
      </div>
    </div>
  )
}
