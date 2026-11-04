/* eslint-disable react/no-unknown-property -- Inertia's <Head> replaces tags by their head-key */
import { Head, usePage } from '@inertiajs/react'
import type { Data } from '@generated/data'

const DEFAULT_DESCRIPTION =
  'Fashion from local shops across Nepal. Order online and pay cash on delivery.'

type SocialMetaProps = {
  title?: string
  description?: string
  /* A path on this site or a full URL. */
  image?: string | null
  type?: 'website' | 'product'
  /* Price in rupees, for product pages. */
  price?: number
}

/*
 * The page description and the preview WhatsApp, Facebook and Messenger
 * show for a shared link. Tags carry a head-key, so a page's own tags
 * replace the defaults from the root layout.
 */
export function SocialMeta({
  title = 'Drip Nepal',
  description = DEFAULT_DESCRIPTION,
  image,
  type = 'website',
  price,
}: SocialMetaProps) {
  const { props, url } = usePage<Data.SharedProps>()
  const absolute = (path: string) => (/^https?:\/\//.test(path) ? path : `${props.appUrl}${path}`)
  const imageUrl = absolute(image ?? '/og-image.jpg')
  const text = description.length > 200 ? `${description.slice(0, 197).trimEnd()}…` : description

  return (
    <Head>
      <meta head-key="description" name="description" content={text} />
      <meta head-key="og:site_name" property="og:site_name" content="Drip Nepal" />
      <meta head-key="og:type" property="og:type" content={type} />
      <meta head-key="og:title" property="og:title" content={title} />
      <meta head-key="og:description" property="og:description" content={text} />
      <meta head-key="og:url" property="og:url" content={absolute(url)} />
      <meta head-key="og:image" property="og:image" content={imageUrl} />
      <meta head-key="twitter:card" name="twitter:card" content="summary_large_image" />
      {price !== undefined && (
        <meta
          head-key="product:price:amount"
          property="product:price:amount"
          content={String(price)}
        />
      )}
      {price !== undefined && (
        <meta head-key="product:price:currency" property="product:price:currency" content="NPR" />
      )}
    </Head>
  )
}
