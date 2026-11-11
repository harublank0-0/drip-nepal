import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { envSchema } from '#start/env_schema'

/*
 * T-ARCH-023: the keys of .env.example equal the keys of the env schema
 * (docs/09 §6.4), so a fresh clone that copies it to .env boots, and a
 * variable added to one is added to the other. `VITE_*` keys are Vite's
 * build-time flags, outside the server schema.
 *
 * Also T-ARCH-024's single-variable half: the key validators refuse a
 * malformed key before the cross-field policy runs.
 */

async function exampleKeys() {
  const text = await readFile(join(process.cwd(), '.env.example'), 'utf8')
  return text
    .split('\n')
    .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
    .filter((key): key is string => Boolean(key) && !key!.startsWith('VITE_'))
}

const VALID_KEY = Buffer.alloc(32, 7).toString('base64')

test.group('T-ARCH-023 .env.example equals the env schema', () => {
  test('every schema key is in .env.example, and nothing else is', async ({ assert }) => {
    const keys = await exampleKeys()
    assert.deepEqual([...keys].sort(), Object.keys(envSchema).sort())
  })

  test('.env.example lists each key once', async ({ assert }) => {
    const keys = await exampleKeys()
    assert.deepEqual(keys, [...new Set(keys)])
  })
})

test.group('T-ARCH-024 env key validators', () => {
  test('a 32-byte key is accepted and released as bytes', ({ assert }) => {
    const key = envSchema.BLIND_INDEX_KEY('BLIND_INDEX_KEY', VALID_KEY)
    assert.equal(key.release().length, 32)
    assert.notInclude(JSON.stringify({ key }), VALID_KEY)
  })

  test('a key of {name} is refused')
    .with([
      { name: '31 bytes', value: Buffer.alloc(31, 7).toString('base64') },
      { name: '33 bytes', value: Buffer.alloc(33, 7).toString('base64') },
      { name: 'hex instead of base64', value: Buffer.alloc(32, 7).toString('hex') },
      { name: 'nothing', value: undefined },
    ])
    .run(({ assert }, { value }) => {
      assert.throws(() => envSchema.HMAC_KEY_AUDIT_IP('HMAC_KEY_AUDIT_IP', value), /32 bytes/)
    })

  test('the key ring parses <id>:<key> entries', ({ assert }) => {
    const ring = envSchema.DATA_ENCRYPTION_KEYS(
      'DATA_ENCRYPTION_KEYS',
      `k1:${VALID_KEY},k2:${Buffer.alloc(32, 9).toString('base64')}`
    )
    assert.deepEqual([...ring.release().keys()], ['k1', 'k2'])
  })

  test('the key ring refuses {name}')
    .with([
      { name: 'an empty value', value: '' },
      { name: 'a duplicate ID', value: `k1:${VALID_KEY},k1:${VALID_KEY}` },
      { name: 'an entry without an ID', value: VALID_KEY },
      { name: 'a short key', value: `k1:${Buffer.alloc(16).toString('base64')}` },
    ])
    .run(({ assert }, { value }) => {
      assert.throws(() => envSchema.DATA_ENCRYPTION_KEYS('DATA_ENCRYPTION_KEYS', value))
    })

  test('APP_NAME, APP_KEY and DB_POOL_MAX refuse bad values', ({ assert }) => {
    assert.throws(() => envSchema.APP_NAME('APP_NAME', 'Drip Nepal'))
    assert.throws(() => envSchema.APP_KEY('APP_KEY', 'too-short'))
    assert.throws(() => envSchema.DB_POOL_MAX('DB_POOL_MAX', '0'))
    assert.throws(() => envSchema.DB_POOL_MAX('DB_POOL_MAX', '21'))
    assert.equal(envSchema.DB_POOL_MAX('DB_POOL_MAX', '8'), 8)
  })
})
