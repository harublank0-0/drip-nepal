import { test } from '@japa/runner'
import vine from '@vinejs/vine'
import { errors as authErrors } from '@adonisjs/auth'
import { errors as httpErrors } from '@adonisjs/core/http'
import { Exception } from '@adonisjs/core/exceptions'
import { errors as shieldErrors } from '@adonisjs/shield'
import { LimiterResponse, errors as limiterErrors } from '@adonisjs/limiter'
import { DomainError, InvalidStateTransition, VersionConflict } from '#exceptions/domain_error'
import { INTERNAL_DETAIL, toProblem } from '#exceptions/to_problem'
import { InvariantViolation, ProviderCallInsideTransaction } from '#exceptions/programming_errors'
import {
  ProviderRejectedError,
  ProviderTimeoutError,
  ProviderUnavailableError,
} from '#exceptions/provider_errors'

/*
 * T-API-012: `toProblem()` maps one error of every source of docs/09 §5.4
 * to its exact body (docs/06 §5.3). Database errors are built with the
 * fields `pg` gives them, including a message and `detail` that quote SQL
 * and a row's values, which must never appear in the body (RF-36).
 */

const ID = 'req-0123456789'
const base = (code: string, status: number, title: string, detail: string) => ({
  type: `https://dripnepal.com/problems/${code.toLowerCase().replaceAll('_', '-')}`,
  title,
  status,
  detail,
  code,
  request_id: ID,
})
const internal = base('INTERNAL', 500, 'Something went wrong', INTERNAL_DETAIL)

// The fields of a `pg` DatabaseError, with the SQL Knex prepends to its message.
function pgError(code: string, constraint?: string) {
  return Object.assign(
    new Error('insert into "shops" ("slug") values ($1) - duplicate key value violates'),
    {
      code,
      severity: 'ERROR',
      constraint,
      detail: 'Key (slug)=(kathmandu-threads) already exists; owner ram@example.com',
      table: 'shops',
    }
  )
}

test.group('T-API-012 toProblem: domain errors', () => {
  test('a DomainError takes status and title from the registry', ({ assert }) => {
    const error = new DomainError('OUT_OF_STOCK', {
      detail: '1 item in your cart is no longer available in the quantity you chose.',
      errors: [
        { field: 'lines.0', code: 'insufficient_stock', message: 'Only 1 left.', available: 1 },
      ],
    })
    assert.deepEqual(toProblem(error, ID), {
      ...base(
        'OUT_OF_STOCK',
        409,
        'Out of stock',
        '1 item in your cart is no longer available in the quantity you chose.'
      ),
      errors: [
        { field: 'lines.0', code: 'insufficient_stock', message: 'Only 1 left.', available: 1 },
      ],
    })
  })

  test('without a detail, the title is the detail', ({ assert }) => {
    assert.deepEqual(
      toProblem(new DomainError('NOT_FOUND'), ID),
      base('NOT_FOUND', 404, 'Not found', 'Not found.')
    )
  })

  test('extensions are added but never replace a core member', ({ assert }) => {
    const error = new DomainError('SHOP_NOT_ACTIVE', {
      extensions: {
        shop_status: 'suspended',
        status: 200,
        code: 'X',
        request_id: 'forged',
        errors: 'x',
        retry_after_seconds: 'abc',
      },
    })
    assert.deepEqual(toProblem(error, ID), {
      ...base('SHOP_NOT_ACTIVE', 403, 'Shop not active', 'Shop not active.'),
      shop_status: 'suspended',
    })
  })

  test('retryAfterSeconds becomes retry_after_seconds', ({ assert }) => {
    const error = new DomainError('IDEMPOTENCY_IN_PROGRESS', { retryAfterSeconds: 2 })
    assert.deepEqual(toProblem(error, ID), {
      ...base('IDEMPOTENCY_IN_PROGRESS', 409, 'Request in progress', 'Request in progress.'),
      retry_after_seconds: 2,
    })
  })

  test('a proposed code cannot be thrown', ({ assert }) => {
    assert.throws(() => new DomainError('SERVICE_BUSY'), 'SERVICE_BUSY is a proposed problem code')
    assert.throws(() => new DomainError('CHECKOUT_DISABLED'), /proposed/)
    assert.throws(() => new DomainError('MALFORMED_REQUEST'), /proposed/)
  })

  test('InvalidStateTransition and VersionConflict carry their members', ({ assert }) => {
    assert.deepEqual(toProblem(new InvalidStateTransition('shipped', ['deliver']), ID), {
      ...base(
        'INVALID_STATE_TRANSITION',
        409,
        'Invalid state transition',
        'Invalid state transition.'
      ),
      current_status: 'shipped',
      allowed_events: ['deliver'],
    })
    assert.deepEqual(toProblem(new VersionConflict({ id: 'p1', version: 4 }), ID), {
      ...base('VERSION_CONFLICT', 412, 'Version conflict', 'Version conflict.'),
      current: { id: 'p1', version: 4 },
    })
  })
})

test.group('T-API-012 toProblem: framework errors', () => {
  test('a Vine validation error lists its fields with snake_case rule codes', async ({
    assert,
  }) => {
    const validator = vine.compile(
      vine.object({ title: vine.string().minLength(3), slug: vine.string() })
    )
    const error = await validator.validate({ title: 'a' }).catch((caught: unknown) => caught)
    assert.deepEqual(toProblem(error, ID), {
      ...base('VALIDATION_FAILED', 422, 'Validation failed', 'Some fields need attention.'),
      errors: [
        {
          field: 'title',
          code: 'min_length',
          message: 'The title field must have at least 3 characters',
        },
        { field: 'slug', code: 'required', message: 'The slug field must be defined' },
      ],
    })
  })

  test('the auth guard gives 401 UNAUTHENTICATED', ({ assert }) => {
    const error = new authErrors.E_UNAUTHORIZED_ACCESS('Unauthorized access', {
      guardDriverName: 'session',
    })
    assert.deepEqual(
      toProblem(error, ID),
      base('UNAUTHENTICATED', 401, 'Authentication required', 'Please log in to continue.')
    )
  })

  test('a CSRF failure is 403, or 401 when signed out on a protected route', ({ assert }) => {
    const error = new shieldErrors.E_BAD_CSRF_TOKEN()
    assert.deepEqual(
      toProblem(error, ID),
      base(
        'FORBIDDEN',
        403,
        'Forbidden',
        'This page is out of date. Reload the page and try again.'
      )
    )
    assert.deepEqual(
      toProblem(error, ID, { signedOutOnProtectedRoute: true }),
      base('UNAUTHENTICATED', 401, 'Authentication required', 'Please log in to continue.')
    )
  })

  test('an unknown route is 404 NOT_FOUND', ({ assert }) => {
    const error = new httpErrors.E_ROUTE_NOT_FOUND(['GET', '/api/v1/nothing'])
    assert.deepEqual(
      toProblem(error, ID),
      base('NOT_FOUND', 404, 'Not found', "We couldn't find that.")
    )
  })

  test('the limiter gives 429 with the seconds until the next attempt', ({ assert }) => {
    const response = new LimiterResponse({ limit: 5, remaining: 0, consumed: 6, availableIn: 37 })
    assert.deepEqual(toProblem(new limiterErrors.E_TOO_MANY_REQUESTS(response), ID), {
      ...base('RATE_LIMITED', 429, 'Too many requests', 'Too many attempts. Try again later.'),
      retry_after_seconds: 37,
    })
  })

  test('the body parser: size limits are 413', ({ assert }) => {
    const multipart = new Exception('request entity too large', {
      code: 'E_REQUEST_ENTITY_TOO_LARGE',
      status: 413,
    })
    const rawBody = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
    })
    const expected = base(
      'PAYLOAD_TOO_LARGE',
      413,
      'Payload too large',
      'The request is too large.'
    )
    assert.deepEqual(toProblem(multipart, ID), expected)
    assert.deepEqual(toProblem(rawBody, ID), expected)
  })

  test('the body parser: malformed JSON is 422 without the body', ({ assert }) => {
    const syntax = Object.assign(
      new SyntaxError('Unexpected token \'r\', "ram@example.com" is not valid JSON'),
      {
        status: 400,
        body: '{"email": ram@example.com}',
      }
    )
    const problem = toProblem(syntax, ID)
    assert.deepEqual(problem, {
      ...base('VALIDATION_FAILED', 422, 'Validation failed', 'Some fields need attention.'),
      errors: [
        { field: null, code: 'malformed_json', message: 'The request body is not valid JSON.' },
      ],
    })
    assert.notInclude(JSON.stringify(problem), 'ram@example.com')

    const strict = new Exception('Invalid JSON, only supports object and array', { status: 422 })
    assert.deepEqual(toProblem(strict, ID).errors, [
      { field: null, code: 'malformed_json', message: 'The request body must be a JSON object.' },
    ])
  })

  // The errors @adonisjs/bodyparser 11.0.4 and its `inflation` and zlib streams throw.
  test('the body parser: {name} is 422 {item}')
    .with([
      {
        name: 'an encoding raw-body does not know',
        item: 'unsupported_media_type',
        error: () =>
          new Exception('unsupported content encoding "br"', {
            status: 415,
            code: 'E_ENCODING_UNSUPPORTED',
          }),
      },
      {
        name: 'an encoding inflation refuses',
        item: 'unsupported_media_type',
        error: () =>
          Object.assign(new Error('Unsupported Content-Encoding: bogus'), { status: 415 }),
      },
      {
        name: 'an aborted body',
        item: 'malformed_body',
        error: () => new Exception('request aborted', { status: 400, code: 'E_REQUEST_ABORTED' }),
      },
      {
        name: 'a broken multipart stream',
        item: 'malformed_body',
        error: () =>
          new Exception('Invalid multipart request', {
            status: 400,
            code: 'E_INVALID_MULTIPART_REQUEST',
          }),
      },
      {
        name: 'a body shorter than its Content-Length',
        item: 'malformed_body',
        error: () =>
          Object.assign(new Error('request size did not match content length'), {
            status: 400,
            type: 'request.size.invalid',
          }),
      },
      {
        name: 'a gzip body that does not decompress',
        item: 'malformed_body',
        error: () =>
          Object.assign(new Error('incorrect header check'), { code: 'Z_DATA_ERROR', errno: -3 }),
      },
    ])
    .run(({ assert }, { item, error }) => {
      const problem = toProblem(error(), ID)
      assert.equal(problem.status, 422)
      assert.equal(problem.code, 'VALIDATION_FAILED')
      assert.lengthOf(problem.errors!, 1)
      assert.equal(problem.errors![0].code, item)
      assert.isNull(problem.errors![0].field)
    })

  test("Lucid's findOrFail on a missing row is 404 NOT_FOUND", ({ assert }) => {
    const error = new Exception('Row not found', { status: 404, code: 'E_ROW_NOT_FOUND' })
    assert.deepEqual(
      toProblem(error, ID),
      base('NOT_FOUND', 404, 'Not found', "We couldn't find that.")
    )
  })

  test('a limiter response with no finite wait gives 60 seconds', ({ assert }) => {
    const response = new LimiterResponse({
      limit: 5,
      remaining: 0,
      consumed: 6,
      availableIn: Number.NaN,
    })
    assert.equal(
      toProblem(new limiterErrors.E_TOO_MANY_REQUESTS(response), ID).retry_after_seconds,
      60
    )
  })
})

test.group('T-API-012 toProblem: PostgreSQL errors', () => {
  test('23505 on an allow-listed key is 422 on its field', ({ assert }) => {
    const problem = toProblem(pgError('23505', 'shops_slug_key'), ID)
    assert.deepEqual(problem, {
      ...base('VALIDATION_FAILED', 422, 'Validation failed', 'Some fields need attention.'),
      errors: [{ field: 'slug', code: 'unique', message: 'This value is already in use.' }],
    })
  })

  test('23514 on an allow-listed CHECK is 422; the refund backstop has its own code', ({
    assert,
  }) => {
    assert.deepEqual(toProblem(pgError('23514', 'products_title_check'), ID).errors, [
      { field: 'title', code: 'invalid', message: 'This value is not allowed.' },
    ])
    assert.deepEqual(
      toProblem(pgError('23514', 'payments_refunded_le_captured_check'), ID),
      base(
        'REFUND_EXCEEDS_REFUNDABLE',
        422,
        'Refund exceeds refundable amount',
        'Refund exceeds refundable amount.'
      )
    )
  })

  test('{name} is 500 INTERNAL with no SQL, constraint or value')
    .with([
      { name: 'a unique key off the allowlist', error: () => pgError('23505', 'users_email_key') },
      {
        name: 'a check name under the wrong SQLSTATE',
        error: () => pgError('23514', 'shops_slug_key'),
      },
      { name: 'a foreign key violation', error: () => pgError('23503', 'shops_owner_fk') },
      { name: 'a deadlock', error: () => pgError('40P01') },
      { name: 'a cancelled query', error: () => pgError('57014') },
      {
        name: 'a knex timeout',
        error: () =>
          Object.assign(new Error('Defined query timeout of 2000ms exceeded'), {
            name: 'KnexTimeoutError',
            timeout: 2000,
          }),
      },
    ])
    .run(({ assert }, { error }) => {
      const problem = toProblem(error(), ID)
      assert.deepEqual(problem, internal)
      const body = JSON.stringify(problem)
      for (const leak of ['insert into', 'shops', 'ram@example.com', 'constraint', '23505']) {
        assert.notInclude(body, leak)
      }
    })

  test('22001 is 422 with one field-less item', ({ assert }) => {
    assert.deepEqual(toProblem(pgError('22001'), ID), {
      ...base('VALIDATION_FAILED', 422, 'Validation failed', 'Some fields need attention.'),
      errors: [{ field: null, code: 'max_length', message: 'A value is too long.' }],
    })
  })

  test('55P03 is 409 CONFLICT with Retry-After 2', ({ assert }) => {
    assert.deepEqual(toProblem(pgError('55P03'), ID), {
      ...base(
        'CONFLICT',
        409,
        'Conflict',
        'Someone else is changing this right now. Try again in a moment.'
      ),
      retry_after_seconds: 2,
    })
  })
})

test.group('T-API-012 toProblem: providers and everything else', () => {
  test('an unavailable or timed-out provider is 503 with Retry-After 30', ({ assert }) => {
    const expected = {
      ...base(
        'PROVIDER_UNAVAILABLE',
        503,
        'Provider unavailable',
        'A service we depend on is not answering. Try again shortly.'
      ),
      retry_after_seconds: 30,
    }
    assert.deepEqual(toProblem(new ProviderUnavailableError('khalti', 'initiate'), ID), expected)
    assert.deepEqual(toProblem(new ProviderTimeoutError('ncm', 'createOrder'), ID), expected)
  })

  test('{name} is 500 INTERNAL')
    .with([
      {
        name: 'an escaped provider rejection',
        error: () => new ProviderRejectedError('khalti', 'refund'),
      },
      {
        name: 'a provider call inside a transaction',
        error: () => new ProviderCallInsideTransaction('Ncm', 'createOrder'),
      },
      {
        name: 'an invariant violation',
        error: () => new InvariantViolation('allocation does not sum'),
      },
      {
        name: 'an int8 parser RangeError',
        error: () => new RangeError('int8 9007199254740993 is unsafe'),
      },
      {
        name: 'a plain error',
        error: () => new Error('select * from users where email = ram@example.com'),
      },
      { name: 'a thrown string', error: () => 'boom' },
      { name: 'a thrown null', error: () => null },
    ])
    .run(({ assert }, { error }) => {
      const problem = toProblem(error(), ID)
      assert.deepEqual(problem, internal)
      assert.notInclude(JSON.stringify(problem), 'ram@example.com')
    })
})
