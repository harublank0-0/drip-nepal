import { Typography } from '~/components/ui/typography'
import { getDiscountPercentage } from '~/lib/utils'
import { ColorVariants } from '~/pages/commerce/product_detail/components/color_variants'

type ProductDetailsProps = {
  title: string

  price: {
    currency: string
    listAmount: number // selling price
    sellingPrice: number // selling price
  }

  variants: {
    colors: {
      color: string
      thumbnailUrl: string
    }[]
    sizes: {
      label: string
      slug: string
    }[]
  }
}

export function ProductDesc(props: ProductDetailsProps) {
  const { title, price, variants } = props

  const discountPercentage = getDiscountPercentage(price.listAmount, price.sellingPrice)

  return (
    <>
      <Typography.H1 className="text-left">{title}</Typography.H1>

      <Typography.Small className="text-primary">{discountPercentage}% off</Typography.Small>

      <div className="flex items-center gap-2">
        <Typography.Large className="text-primary">
          {price.currency} {price.sellingPrice}
        </Typography.Large>

        <Typography.Strike>
          {price.currency} {price.listAmount}
        </Typography.Strike>
      </div>

      <ColorVariants colors={variants.colors} />
    </>
  )
}
