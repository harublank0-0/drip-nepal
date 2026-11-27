import { test } from '@japa/runner'
import {
  axisStates,
  choose,
  selectedVariant,
  selectionOf,
  type SelectionAxis,
  type SelectionVariant,
} from '#shared/ui/variant_selection'

/*
 * T-UI-015 (the unit part): the availability matrix of the variant picker
 * (docs/08 §11.2; 02 AC-J02-04). Two colours by three sizes: black M sold
 * out, white L not offered.
 */
const axes: SelectionAxis[] = [
  {
    code: 'color',
    values: [
      { code: 'black', label: 'Black' },
      { code: 'white', label: 'White' },
    ],
  },
  {
    code: 'apparel_size',
    values: [
      { code: 's', label: 'S' },
      { code: 'm', label: 'M' },
      { code: 'l', label: 'L' },
    ],
  },
]
const variant = (id: string, color: string, size: string, inStock = true): SelectionVariant => ({
  id,
  option_values: { color, apparel_size: size },
  in_stock: inStock,
})
const variants = [
  variant('bs', 'black', 's'),
  variant('bm', 'black', 'm', false),
  variant('bl', 'black', 'l'),
  variant('ws', 'white', 's'),
  variant('wm', 'white', 'm'),
]
const reasons = (selection: Record<string, string>) =>
  axisStates(axes, variants, selection).map((values) =>
    values.map((value) => `${value.code}:${value.reason ?? 'ok'}`)
  )

test.group('T-UI-015 the variant availability matrix', () => {
  test('T-UI-015 what can be chosen before and after the primary value', ({ assert }) => {
    assert.deepEqual(reasons({}), [
      ['black:ok', 'white:ok'],
      ['s:ok', 'm:ok', 'l:ok'],
    ])
    assert.deepEqual(reasons({ color: 'black' })[1], ['s:ok', 'm:sold_out', 'l:ok'])
    assert.deepEqual(reasons({ color: 'white' })[1], ['s:ok', 'm:ok', 'l:not_offered'])
    // The size never blocks a colour: the primary axis ignores the secondary choice.
    assert.deepEqual(reasons({ apparel_size: 'm' })[0], ['black:ok', 'white:ok'])
    assert.deepEqual(reasons({ color: 'black', apparel_size: 'm' })[0], ['black:ok', 'white:ok'])
  })

  test('T-UI-015 a primary value sold out in every size is sold out', ({ assert }) => {
    const soldOut = variants.map((item) =>
      item.option_values.color === 'white' ? { ...item, in_stock: false } : item
    )
    const states = axisStates(axes, soldOut, {})
    assert.deepEqual(
      states[0].map((value) => [value.code, value.selectable, value.reason]),
      [
        ['black', true, null],
        ['white', false, 'sold_out'],
      ]
    )
  })

  test('T-UI-015 a new primary value clears a secondary choice it does not offer', ({ assert }) => {
    const notOffered = choose(
      axes,
      variants,
      { color: 'black', apparel_size: 'l' },
      'color',
      'white'
    )
    assert.deepEqual(notOffered.selection, { color: 'white' })
    assert.deepEqual(notOffered.cleared, {
      axis: 'apparel_size',
      value: 'l',
      reason: 'not_offered',
    })
    const soldOut = choose(axes, variants, { color: 'white', apparel_size: 'm' }, 'color', 'black')
    assert.deepEqual(soldOut.selection, { color: 'black' })
    assert.deepEqual(soldOut.cleared, { axis: 'apparel_size', value: 'm', reason: 'sold_out' })
    const kept = choose(axes, variants, { color: 'white', apparel_size: 's' }, 'color', 'black')
    assert.deepEqual(kept, { selection: { color: 'black', apparel_size: 's' }, cleared: null })
    const secondary = choose(axes, variants, { color: 'black' }, 'apparel_size', 'l')
    assert.deepEqual(secondary, { selection: { color: 'black', apparel_size: 'l' }, cleared: null })
  })

  test('T-UI-015 the variant a full choice names, and a preselection', ({ assert }) => {
    assert.equal(selectedVariant(axes, variants, { color: 'black', apparel_size: 'l' })?.id, 'bl')
    assert.isNull(selectedVariant(axes, variants, { color: 'black' }))
    assert.isNull(selectedVariant(axes, variants, { color: 'white', apparel_size: 'l' }))
    const plain = [{ id: 'default', option_values: {}, in_stock: true }]
    assert.equal(selectedVariant([], plain, {})?.id, 'default')
    assert.deepEqual(selectionOf(axes, variants[2]), { color: 'black', apparel_size: 'l' })
    assert.deepEqual(selectionOf(axes, null), {})
  })

  test('T-UI-015 with one axis, a value is sold out when its variant is', ({ assert }) => {
    const sizes = [axes[1]]
    const one = [variant('s', 'black', 's'), variant('m', 'black', 'm', false)]
    assert.deepEqual(
      axisStates(sizes, one, {})[0].map((value) => value.reason),
      [null, 'sold_out', 'not_offered']
    )
  })
})
