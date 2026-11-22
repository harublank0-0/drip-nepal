import { test } from '@japa/runner'
import {
  fallbackProblem,
  isProblem,
  splitServerErrors,
  toFormPath,
  type Problem,
} from '#shared/api/problem'

/*
 * T-UI-005, the mapping part (docs/08 §7.1): a server field error goes under
 * the field it names, in the form's bracket paths; one with `field: null`
 * or an unknown path goes to the error summary; several for one field stay
 * together. The component half (focus, clearing on edit) waits for the
 * component tests.
 */
const problem = (errors: Problem['errors']): Problem => ({
  type: 'about:blank',
  title: 'Validation failed',
  status: 422,
  code: 'VALIDATION_FAILED',
  request_id: 'r-1',
  errors,
})

test.group('T-UI-005 server errors on a form', () => {
  test('T-UI-005 dotted array indexes become bracket paths', ({ assert }) => {
    assert.equal(toFormPath('variants.2.sku'), 'variants[2].sku')
    assert.equal(toFormPath('items.10'), 'items[10]')
    assert.equal(toFormPath('credentials.token'), 'credentials.token')
  })

  test('T-UI-005 known fields get their messages; the rest go to the summary', ({ assert }) => {
    const { fields, formLevel } = splitServerErrors(
      problem([
        { field: 'variants.2.sku', code: 'unique', message: 'SKU taken' },
        { field: 'variants.2.sku', code: 'format', message: 'Bad SKU' },
        { field: null, code: 'rule', message: 'Whole form' },
        { field: 'unknown_field', code: 'x', message: 'Not on this form' },
      ]),
      new Set(['variants[2].sku']),
      (item) => item.message
    )
    assert.deepEqual([...fields], [['variants[2].sku', ['SKU taken', 'Bad SKU']]])
    assert.deepEqual(formLevel, ['Whole form', 'Not on this form'])
  })

  test('T-UI-005 a body that is not problem+json still gives a problem', ({ assert }) => {
    assert.isTrue(isProblem(problem([])))
    assert.isFalse(isProblem({ message: 'Bad Gateway' }))
    assert.isFalse(isProblem(null))
    assert.deepInclude(fallbackProblem(502), { status: 502, code: 'INTERNAL' })
    assert.equal(fallbackProblem(undefined).status, 500)
  })
})
