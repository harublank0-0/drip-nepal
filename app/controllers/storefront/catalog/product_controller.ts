import type { HttpContext } from '@adonisjs/core/http'
import { appUrl, mediaPublicUrl } from '#config/storefront'
import { DomainError } from '#exceptions/domain_error'
import { publicIdFromPath } from '#modules/catalog/domain/identifiers'
import { storefrontProduct } from '#modules/catalog/queries'
import {
  jsonLdScript,
  productHref,
  productJsonLd,
  storefrontProductPageJson,
} from '#transformers/catalog/storefront_transformer'

/*
 * The storefront product page `/p/{slug}-{publicId}` (docs/08 §2.2, §11.2;
 * ADR-0017 decisions 1, 6 and 8; 02 AC-J02-01, -02, -07; R1-S part 3d-ii).
 *
 * - Only the public ID identifies the product: the 8 characters after the
 *   last hyphen, in any case, Crockford aliases mapped (`publicIdFromPath`).
 *   A segment with none, an unknown ID, or a product the storefront does
 *   not show (not published, or its shop not active) is the 404 page.
 * - The canonical path is the current slug and the lowercase ID. Any other
 *   form (an old or wrong slug, no slug, another case) answers 301 to it
 *   with `Cache-Control: public, max-age=86400`, keeping only `variant`,
 *   the page's one parameter (08 §11.2).
 * - The page names its canonical URL and carries the JSON-LD `Product`.
 */
const PAGE_PARAMETERS = ['variant']

export default class ProductController {
  async show(ctx: HttpContext) {
    const publicId = publicIdFromPath(String(ctx.params.segment))
    if (publicId === null) throw new DomainError('NOT_FOUND')
    const product = await storefrontProduct(publicId)
    if (!product) throw new DomainError('NOT_FOUND')

    const path = productHref(product.slug, product.publicId)
    if (ctx.request.url() !== path) {
      const query = new URLSearchParams()
      const asked = ctx.request.qs()
      for (const name of PAGE_PARAMETERS) {
        if (typeof asked[name] === 'string') query.set(name, asked[name])
      }
      const search = query.toString()
      ctx.response.header('Cache-Control', 'public, max-age=86400')
      return ctx.response
        .redirect()
        .status(301)
        .toPath(search === '' ? path : `${path}?${search}`)
    }

    const page = storefrontProductPageJson(product, mediaPublicUrl)
    const canonical = `${appUrl}${path}`
    const images = page.media.map((item) => item.src).filter((src) => src !== '')
    return ctx.inertia.render('storefront/product', {
      product: page,
      seo: {
        canonical,
        json_ld: jsonLdScript(productJsonLd(product, canonical, images)),
      },
    })
  }
}
