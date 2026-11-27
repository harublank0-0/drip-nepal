import { test } from '@japa/runner'
import { MEDIA_UPLOAD_LIMITS, PRODUCT_MEDIA_LIMITS } from '#shared/constants/limits'
import type { AttributeOption, SellerProduct } from '#shared/ui/product_details'
import {
  afterSave,
  altFallback,
  altProblem,
  colorOptions,
  colourGone,
  colourLabel,
  maxUploadMegabytes,
  placeErrors,
  fileProblem,
  galleryBody,
  galleryFrom,
  MAX_GALLERY,
  moveItem,
  roomLeft,
  sameGallery,
} from '#shared/ui/product_media'

/*
 * T-UI-049 (docs/10 §6.9; R1-S part 2g-ii): the product editor's gallery
 * rules, from the saved media to the `replaceProductMedia` body.
 */
const media = (id: string, position: number, extra: Partial<SellerProduct['media'][0]> = {}) => ({
  media_asset_id: id,
  position,
  alt_text: null,
  color_value_id: null,
  keys: { 320: `p/${id}/a-320.webp` },
  ...extra,
})

const variant = (codes: Record<string, string>, status = 'active') =>
  ({ option_value_codes: codes, status }) as unknown as SellerProduct['variants'][0]

const COLOR: AttributeOption = {
  code: 'color',
  name: 'Colour',
  input: 'swatch',
  values: [
    { id: 'id-black', code: 'black', label: 'Black', swatch_hex: '#000000', is_active: true },
    { id: 'id-white', code: 'white', label: 'White', swatch_hex: '#ffffff', is_active: true },
    { id: 'id-red', code: 'red', label: 'Red', swatch_hex: '#ff0000', is_active: true },
  ],
}

test.group('T-UI-049 editor gallery rules', () => {
  test('T-UI-049 the gallery follows the saved positions and is sent as positions 1 to n', ({
    assert,
  }) => {
    const items = galleryFrom({
      media: [media('b', 2, { alt_text: 'Back', color_value_id: 'id-black' }), media('a', 1)],
    })
    assert.deepEqual(
      items.map((item) => [item.assetId, item.alt, item.colorValueId]),
      [
        ['a', '', null],
        ['b', 'Back', 'id-black'],
      ]
    )
    const moved = moveItem(items, 1, -1)
    moved[0] = { ...moved[0], alt: '  Back view  ' }
    moved[1] = { ...moved[1], alt: '   ' }
    assert.deepEqual(galleryBody(moved), {
      items: [
        { media_asset_id: 'b', position: 1, alt_text: 'Back view', color_value_id: 'id-black' },
        { media_asset_id: 'a', position: 2, alt_text: null, color_value_id: null },
      ],
    })
  })

  test('T-UI-049 an untouched gallery is no change; a move, a text or a removal is', ({
    assert,
  }) => {
    const product = { media: [media('a', 1), media('b', 2, { alt_text: 'Back' })] }
    const items = galleryFrom(product)
    assert.isTrue(sameGallery(items, product))
    // Spaces around a text are trimmed away, so they change nothing.
    assert.isTrue(sameGallery([items[0], { ...items[1], alt: ' Back ' }], product))
    assert.isFalse(sameGallery(moveItem(items, 0, 1), product))
    assert.isFalse(sameGallery([items[0], { ...items[1], alt: 'Side' }], product))
    assert.isFalse(sameGallery([items[0]], product))
  })

  test('T-UI-049 a move stops at either end', ({ assert }) => {
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, -1), ['a', 'b', 'c'])
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 1), ['a', 'b', 'c'])
    assert.deepEqual(moveItem(['a', 'b', 'c'], 1, 1), ['a', 'c', 'b'])
  })

  test('T-UI-049 an image may show only a colour an active variant has', ({ assert }) => {
    const product = {
      variants: [
        variant({ color: 'white', apparel_size: 'm' }),
        variant({ color: 'black', apparel_size: 'm' }),
        variant({ color: 'red', apparel_size: 'l' }, 'archived'),
      ],
    }
    // In the attribute's order; the archived red is not offered.
    assert.deepEqual(colorOptions(product, [COLOR]), [
      { id: 'id-black', label: 'Black' },
      { id: 'id-white', label: 'White' },
    ])
    assert.deepEqual(colorOptions({ variants: [variant({ apparel_size: 'm' })] }, [COLOR]), [])
    assert.deepEqual(colorOptions(product, []), [])
  })

  test('T-UI-049 a file is refused before any request by its type or size; alt text by its length', ({
    assert,
  }) => {
    assert.isNull(fileProblem({ type: 'image/webp', size: 2048 }))
    assert.equal(fileProblem({ type: 'image/heic', size: 2048 }), 'type')
    assert.equal(fileProblem({ type: 'image/svg+xml', size: 2048 }), 'type')
    assert.equal(fileProblem({ type: 'image/png', size: 0 }), 'size')
    assert.isNull(fileProblem({ type: 'image/jpeg', size: MEDIA_UPLOAD_LIMITS.maxBytes }))
    assert.equal(
      fileProblem({ type: 'image/jpeg', size: MEDIA_UPLOAD_LIMITS.maxBytes + 1 }),
      'size'
    )
    assert.equal(maxUploadMegabytes(), 10)
    const max = PRODUCT_MEDIA_LIMITS.altText.max
    assert.isNull(altProblem('x'.repeat(max)))
    assert.isNull(altProblem(`  ${'x'.repeat(max)}  `))
    assert.equal(altProblem('x'.repeat(max + 1)), 'too_long')
    // Counted in code points: an emoji is one character, as the database counts it.
    assert.isNull(altProblem('😀'.repeat(max)))
  })

  test('T-UI-049 an image without alt text is described as the storefront describes it', ({
    assert,
  }) => {
    assert.equal(altFallback('Crew tee', colourLabel([COLOR], 'id-white')), 'Crew tee, White')
    assert.equal(altFallback('Crew tee', colourLabel([COLOR], null)), 'Crew tee')
    // A colour the choices no longer hold is no colour.
    assert.equal(altFallback('Crew tee', colourLabel([COLOR], 'id-gone')), 'Crew tee')
  })

  test('T-UI-049 an image naming a colour no active variant has must change it', ({ assert }) => {
    const colours = [{ id: 'id-black' }, { id: 'id-white' }]
    assert.isFalse(colourGone({ colorValueId: null }, colours))
    assert.isFalse(colourGone({ colorValueId: 'id-white' }, colours))
    assert.isTrue(colourGone({ colorValueId: 'id-red' }, colours))
    // A product that no longer varies by colour keeps no link.
    assert.isTrue(colourGone({ colorValueId: 'id-white' }, []))
  })

  test('T-UI-049 a 422 is placed on the images sent, by asset, and the rest is form-level', ({
    assert,
  }) => {
    const sent = [{ assetId: 'a' }, { assetId: 'b' }]
    const placed = placeErrors(
      [
        { field: 'items.1.alt_text', code: 'too_long', message: 'Too long.' },
        { field: 'items.1.color_value_id', code: 'not_allowed', message: 'Not a colour.' },
        { field: 'items.0.media_asset_id', code: 'not_ready', message: 'Not ready.' },
        { field: 'items', code: 'required', message: 'Needs one.' },
        { field: 'items.5.alt_text', code: 'too_long', message: 'No such image.' },
        { field: 'items.0.position', code: 'positions', message: 'Bad position.' },
        { field: null, code: 'other', message: 'Other.' },
      ],
      sent
    )
    assert.deepEqual(placed.items, {
      a: { asset: 'Not ready.' },
      b: { alt: 'Too long.', colour: 'Not a colour.' },
    })
    assert.deepEqual(placed.formLevel, ['Needs one.', 'No such image.', 'Bad position.', 'Other.'])
  })

  test('T-UI-049 after a save, an image that turned ready meanwhile stays, unsaved', ({
    assert,
  }) => {
    const saved = { media: [media('b', 1), media('a', 2, { alt_text: 'Front' })] }
    const current = [
      { assetId: 'a', keys: null, alt: 'Front', colorValueId: null },
      { assetId: 'b', keys: null, alt: '', colorValueId: null },
      { assetId: 'c', keys: null, alt: 'New', colorValueId: null },
    ]
    assert.deepEqual(
      afterSave(saved, current, new Set(['a', 'b'])).map((item) => [item.assetId, item.alt]),
      [
        ['b', ''],
        ['a', 'Front'],
        ['c', 'New'],
      ]
    )
    // An image sent but not kept by the server is not brought back.
    assert.deepEqual(
      afterSave({ media: [media('a', 1)] }, current.slice(0, 2), new Set(['a', 'b'])).map(
        (item) => item.assetId
      ),
      ['a']
    )
  })

  test('T-UI-049 the gallery takes at most 12 images, uploads included', ({ assert }) => {
    assert.equal(MAX_GALLERY, 12)
    assert.equal(roomLeft(0, 0), 12)
    assert.equal(roomLeft(10, 1), 1)
    assert.equal(roomLeft(12, 0), 0)
    assert.equal(roomLeft(11, 3), 0)
  })
})
