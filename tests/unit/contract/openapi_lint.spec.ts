import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureTree, runCommand } from '#tests/support/scripts'

/*
 * T-API-009: the OpenAPI 3.1 lint of docs/openapi.yaml with Redocly CLI and
 * redocly.yaml (docs/09 §4.5). It fails on an invalid schema, a broken
 * $ref and a duplicate operationId.
 */

const REDOCLY = join(process.cwd(), 'node_modules', '.bin', 'redocly')
const CONFIG = join(process.cwd(), 'redocly.yaml')
const env = { ...process.env, REDOCLY_TELEMETRY: 'off', REDOCLY_SUPPRESS_UPDATE_NOTICE: 'true' }

const lint = (file: string) => runCommand(REDOCLY, ['lint', file, '--config', CONFIG], { env })

test.group('T-API-009 OpenAPI lint', (group) => {
  group.each.timeout(60_000)

  test('T-API-009 docs/openapi.yaml passes', async ({ assert }) => {
    const result = await lint('docs/openapi.yaml')
    assert.equal(result.code, 0, `${result.stdout}${result.stderr}`)
  })

  test('T-API-009 fails on {case}')
    .with([
      {
        case: 'a duplicate operationId',
        change: (spec: string) =>
          spec.replace('operationId: createProduct', 'operationId: listProducts'),
        expected: 'operation-operationId-unique',
      },
      {
        case: 'a broken $ref',
        change: (spec: string) =>
          spec.replace("$ref: '#/components/schemas/Uuid'", "$ref: '#/components/schemas/Uuidd'"),
        expected: 'no-unresolved-refs',
      },
      {
        case: 'an invalid schema',
        change: (spec: string) =>
          spec.replace('openapi: 3.1.0', 'openapi: 3.1.0\nnot_a_field: true'),
        expected: 'struct',
      },
    ])
    .run(async ({ assert }, { change, expected }) => {
      const spec = await readFile('docs/openapi.yaml', 'utf8')
      const broken = change(spec)
      assert.notEqual(broken, spec, 'the fixture change must apply')
      const tree = await fixtureTree({ 'openapi.yaml': broken })
      try {
        const result = await lint(join(tree.root, 'openapi.yaml'))
        assert.equal(result.code, 1)
        assert.include(`${result.stdout}${result.stderr}`, expected)
      } finally {
        await tree.cleanup()
      }
    })
})
