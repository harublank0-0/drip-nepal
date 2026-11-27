import { test } from '@japa/runner'
import { publicIdFromPath } from '#modules/catalog/domain/identifiers'
import { discountPercent } from '#shared/format/money'
import type { StorefrontProduct } from '#modules/catalog/queries'
import { productJsonLd } from '#transformers/catalog/storefront_transformer'

/*
 * T-UI-048 (the unit part): reading a product page's path segment
 * (ADR-0017 decision 1) and the saving against a compare-at price (02
 * AC-J02-03).
 */
test.group('T-UI-048 the product path and the saving', () => {
  test('T-UI-048 the public ID after the last hyphen, any case, aliases mapped', ({ assert }) => {
    assert.equal(publicIdFromPath('linen-shirt-8k3m9qzt'), '8K3M9QZT')
    assert.equal(publicIdFromPath('8K3M9QZT'), '8K3M9QZT')
    assert.equal(publicIdFromPath('a-b-c-8K3M9QZT'), '8K3M9QZT')
    assert.equal(publicIdFromPath('tee-o1ilOILz'), '0111011Z')
    for (const segment of [
      'linen-shirt',
      'tee-8K3M9QZ',
      'tee-8K3M9QZTX',
      'tee-8K3M9QZU',
      '',
      'x'.repeat(101),
    ]) {
      assert.isNull(publicIdFromPath(segment), segment)
    }
  })

  test('T-UI-048 the saving in whole percent, rounded down', ({ assert }) => {
    assert.equal(discountPercent(199900, 250000), 20)
    assert.equal(discountPercent(199999, 250000), 20)
    assert.equal(discountPercent(100, 300), 66)
    assert.isNull(discountPercent(199900, null))
    assert.isNull(discountPercent(199900, 199900))
    assert.isNull(discountPercent(199900, 150000))
  })

  test('T-UI-048 the JSON-LD names the brand and the images it is given', ({ assert }) => {
    const product = {
      title: 'Crew tee',
      description: 'Soft.',
      brand: { slug: 'himal-wear', name: 'Himal Wear' },
      optionAxes: [],
      variants: [{ priceMinor: 129950, available: 0 }],
      currency: 'NPR',
    } as unknown as StorefrontProduct
    const url = 'https://dripnepal.com/p/crew-tee-8k3m9qzt'
    const image = 'https://media.example/p/a/x-640.webp'
    assert.deepEqual(productJsonLd(product, url, [image]), {
      '@context': 'https://schema.org',
      '@type': 'Product',
      'name': 'Crew tee',
      'description': 'Soft.',
      'url': url,
      'image': [image],
      'brand': { '@type': 'Brand', 'name': 'Himal Wear' },
      'offers': {
        '@type': 'Offer',
        'price': '1299.50',
        'priceCurrency': 'NPR',
        'availability': 'https://schema.org/OutOfStock',
        'itemCondition': 'https://schema.org/NewCondition',
        'url': url,
      },
    })
  })
})
