import { Head } from '@inertiajs/react'
import { Link } from '@adonisjs/inertia/react'
import type { InertiaProps } from '~/types'
import { urlFor } from '~/client'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { PageSeo } from '~/components/seo/page_seo'
import { SocialMeta } from '~/components/seo/social_meta'
import { ProductCard, type ListingCard } from '~/components/catalog/product_card'

/*
 * `/`, the storefront home (docs/08 §2.2, §3.1 "Home"; R1-S part
 * 3d-iii-b-2): entry and discovery. The heading and the way into the two
 * audience pages, then the newest listed products as cards, then the
 * top-level categories as tiles. With few products the rows collapse:
 * without any, the new arrivals row is left out rather than showing a gap.
 * Staff whose role may open the admin pages get a link to them
 * (`admin_link`, decided by the server). Featured shops wait for other
 * vendors.
 */
// The cards' displayed width in the home grid, which has no sidebar (08 §10.4).
const HOME_CARD_SIZES =
  '(min-width: 1328px) 308px, (min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw'

type Props = InertiaProps<{
  admin_link: boolean
  new_arrivals: ListingCard[]
  categories: { slug: string; name: string }[]
  seo: { canonical: string }
}>

export default function Home({ admin_link, new_arrivals, categories, seo }: Props) {
  return (
    <>
      <Head title={t('storefront.home.title')} />
      <SocialMeta title={t('storefront.home.title')} description={t('storefront.home.body')} />
      <PageSeo canonical={seo.canonical} noindex={false} />
      <div className="mx-auto flex max-w-7xl flex-col gap-12 py-8 md:py-12">
        <section className="flex flex-col gap-4">
          <h1
            tabIndex={-1}
            className="font-heading max-w-2xl text-3xl font-semibold tracking-tight outline-none md:text-5xl"
          >
            {t('storefront.home.title')}
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">{t('storefront.home.body')}</p>
          <div className="flex flex-wrap gap-3">
            <Button asChild className="h-11 text-base">
              <Link href="/men">{t('storefront.home.shop_men')}</Link>
            </Button>
            <Button asChild variant="outline" className="h-11 text-base">
              <Link href="/women">{t('storefront.home.shop_women')}</Link>
            </Button>
            {admin_link && (
              <Button asChild variant="ghost" className="h-11 text-base">
                <a href={urlFor('admin.logistics')}>{t('storefront.home.admin')}</a>
              </Button>
            )}
          </div>
        </section>
        {new_arrivals.length > 0 ? (
          <section aria-labelledby="home-new-arrivals" className="flex flex-col gap-4">
            <h2
              id="home-new-arrivals"
              className="font-heading text-2xl font-semibold tracking-tight"
            >
              {t('storefront.home.new_arrivals')}
            </h2>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
              {new_arrivals.map((card, index) => (
                <li key={card.public_id}>
                  <ProductCard card={card} eager={index < 4} sizes={HOME_CARD_SIZES} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {categories.length > 0 ? (
          <section aria-labelledby="home-categories" className="flex flex-col gap-4">
            <h2 id="home-categories" className="font-heading text-2xl font-semibold tracking-tight">
              {t('storefront.home.categories')}
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/c/${category.slug}`}
                    className="hover:bg-muted focus-visible:ring-ring/50 flex min-h-20 items-center justify-center rounded-lg border p-4 text-center font-medium outline-none focus-visible:ring-3"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  )
}
