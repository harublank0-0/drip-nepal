import { test } from '@japa/runner'
import { imageSources, productHref } from '#transformers/catalog/storefront_transformer'

/*
 * T-UI-046: a listing card's image as `<img>` takes it, from the public
 * bucket's base URL, and the product's page path (ADR-0017).
 */
test.group('T-UI-046 the card image and link', () => {
  test('T-UI-046 every width in srcset, the widest up to 640 as src', ({ assert }) => {
    const keys = { 1280: 'p/a/x-1280.webp', 320: 'p/a/x-320.webp', 640: 'p/a/x-640.webp' }
    assert.deepEqual(imageSources(keys, 'https://media.example/'), {
      src: 'https://media.example/p/a/x-640.webp',
      srcset:
        'https://media.example/p/a/x-320.webp 320w, https://media.example/p/a/x-640.webp 640w, https://media.example/p/a/x-1280.webp 1280w',
    })
    assert.equal(
      imageSources({ 1280: 'p/a/x-1280.webp' }, 'https://m').src,
      'https://m/p/a/x-1280.webp'
    )
  })

  test('T-UI-046 no public store gives no URL', ({ assert }) => {
    assert.deepEqual(imageSources({ 320: 'p/a/x-320.webp' }, ''), { src: '', srcset: '' })
  })

  test('T-UI-046 the page path has the lowercase public ID', ({ assert }) => {
    assert.equal(productHref('crew-tee', '7K3M9QXA'), '/p/crew-tee-7k3m9qxa')
  })
})
