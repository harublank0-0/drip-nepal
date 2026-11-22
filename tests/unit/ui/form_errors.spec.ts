import { test } from '@japa/runner'
import {
  fallbackProblem,
  isProblem,
  problemFrom,
  splitServerErrors,
  toFormPath,
  type Problem,
} from '#shared/api/problem'
import { afterFailedSubmit, fieldErrorItems, SUMMARY_TARGET } from '#shared/ui/error_summary'

/*
 * T-UI-005, the mapping part (docs/08 §7.1): a server field error goes under
 * the field it names, in the form's bracket paths; one with `field: null`
 * or an unknown path goes to the error summary; several for one field stay
 * together. A problem+json body reaches the client as text and is parsed.
 * After a failed submit, one field error focuses its field and anything
 * else the summary. The component half (focus in the browser, clearing on
 * edit) waits for the component tests.
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

  test('T-UI-005 a problem+json body that arrives as text is parsed', ({ assert }) => {
    // Tuyau 1.2.2 parses only application/json, so the server's
    // application/problem+json reaches TuyauHTTPError.response as text.
    const sent = problem([{ field: 'name', code: 'minLength', message: 'Too short' }])
    assert.deepEqual(problemFrom(JSON.stringify(sent), 422), sent)
    assert.deepEqual(problemFrom(sent, 422), sent)
    assert.deepInclude(problemFrom('<html>Bad Gateway</html>', 502), {
      status: 502,
      code: 'INTERNAL',
    })
    assert.deepInclude(problemFrom('{"message":"no"}', 400), { status: 400, code: 'INTERNAL' })
    assert.deepInclude(problemFrom(undefined, undefined), { status: 500, code: 'INTERNAL' })
  })
})

test.group('T-UI-005 after a failed submit', () => {
  const FIELDS = [
    { name: 'name', id: 'account-name' },
    { name: 'credentials.token', id: 'account-token' },
  ]

  test('T-UI-005 field messages come in the form order, once each, from every slot', ({
    assert,
  }) => {
    const maps: Record<string, Record<string, unknown>> = {
      'credentials.token': { onBlur: 'Token rule', onServer: 'Token refused' },
      'name': { onBlur: 'Name rule', onServer: 'Name rule', onChange: undefined },
    }
    assert.deepEqual(
      fieldErrorItems(FIELDS, (name) => maps[name]),
      [
        { message: 'Name rule', target: 'account-name' },
        { message: 'Token rule', target: 'account-token' },
        { message: 'Token refused', target: 'account-token' },
      ]
    )
    assert.deepEqual(
      fieldErrorItems(FIELDS, () => undefined),
      []
    )
  })

  test('T-UI-005 {label}')
    .with([
      { label: 'no error moves nothing', fields: 0, formLevel: 0, summary: false, focus: null },
      {
        label: 'one field error focuses that field',
        fields: 1,
        formLevel: 0,
        summary: false,
        focus: 'account-name',
      },
      {
        label: 'two field errors focus the summary',
        fields: 2,
        formLevel: 0,
        summary: true,
        focus: SUMMARY_TARGET,
      },
      {
        label: 'a form-level error alone shows the summary',
        fields: 0,
        formLevel: 1,
        summary: true,
        focus: SUMMARY_TARGET,
      },
      {
        label: 'a field and a form-level error show the summary',
        fields: 1,
        formLevel: 1,
        summary: true,
        focus: SUMMARY_TARGET,
      },
    ])
    .run(({ assert }, row) => {
      const items = Array.from({ length: row.fields }, () => ({
        message: 'Name rule',
        target: 'account-name',
      }))
      const formLevel = Array.from({ length: row.formLevel }, () => 'Whole form')
      assert.deepEqual(afterFailedSubmit(items, formLevel), {
        summary: row.summary,
        focus: row.focus,
      })
    })
})
