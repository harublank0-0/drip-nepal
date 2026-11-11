import { test } from '@japa/runner'
import { Writable } from 'node:stream'
import { Logger } from '@adonisjs/core/logger'
import loggerConfig from '#config/logger'
import { REDACT_CENSOR, REDACT_PATHS } from '#config/log_redaction'

/*
 * T-SEC-027 (the log half; the HTTP half is in
 * tests/functional/platform/error_contract.spec.ts): the application
 * logger's own configuration, writing to memory, receives an object with
 * every redaction path of docs/09 §7.2 filled in, and its output contains
 * none of the values. A PostgreSQL error's `detail` comes out redacted.
 */

// Builds an object with a distinct value at `path` (`*` becomes `nested`).
function setPath(target: Record<string, unknown>, path: string, value: string) {
  const keys = [...path.matchAll(/\["([^"]+)"\]|([^.[\]]+)/g)].map(
    (match) => match[1] ?? (match[2] === '*' ? 'nested' : match[2])
  )
  let cursor = target
  for (const key of keys.slice(0, -1)) {
    cursor[key] ??= {}
    cursor = cursor[key] as Record<string, unknown>
  }
  cursor[keys.at(-1)!] = value
}

function memoryLogger() {
  const chunks: string[] = []
  const destination = new Writable({
    write(chunk, _encoding, done) {
      chunks.push(String(chunk))
      done()
    },
  })
  const { app } = loggerConfig.loggers
  const logger = new Logger({
    ...app,
    enabled: true,
    level: 'info',
    transport: undefined,
    destination,
  })
  return { logger, output: () => chunks.join('') }
}

test.group('T-SEC-027 log redaction', () => {
  test('the app logger is configured with the redaction list', ({ assert }) => {
    assert.deepEqual(loggerConfig.loggers.app.redact, {
      paths: REDACT_PATHS,
      censor: REDACT_CENSOR,
    })
  })

  test('no value at a redacted path reaches the output', ({ assert }) => {
    const { logger, output } = memoryLogger()
    const line: Record<string, unknown> = {}
    REDACT_PATHS.forEach((path, index) => setPath(line, path, `leak-${index}-value`))
    logger.info(line, 'redaction.check')

    const written = output()
    assert.include(written, 'redaction.check')
    REDACT_PATHS.forEach((path, index) => {
      assert.notInclude(written, `leak-${index}-value`, path)
    })
  })

  test("a PostgreSQL error's detail is redacted; its SQLSTATE and constraint are not", ({
    assert,
  }) => {
    const { logger, output } = memoryLogger()
    const error = Object.assign(
      new Error('insert into "users" ("email") values ($1) - duplicate key'),
      {
        code: '23505',
        constraint: 'users_email_key',
        detail: 'Key (email)=(ram@example.com) already exists.',
      }
    )
    logger.error({ err: error }, 'http.error')

    const written = JSON.parse(output())
    assert.equal(written.err.detail, REDACT_CENSOR)
    assert.equal(written.err.code, '23505')
    assert.equal(written.err.constraint, 'users_email_key')
    assert.notInclude(JSON.stringify(written), 'ram@example.com')
  })
})
