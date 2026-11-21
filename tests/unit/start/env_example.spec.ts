import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { envSchema } from '#start/env_schema'
import { PUBLIC_KEY_SHA256 } from '#start/env_policy'

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

  test('a malformed ring entry is named by position, never by its content', ({ assert }) => {
    for (const value of [VALID_KEY, `k1=${VALID_KEY}`, `k1:${VALID_KEY},${VALID_KEY}`]) {
      let message = ''
      try {
        envSchema.DATA_ENCRYPTION_KEYS('DATA_ENCRYPTION_KEYS', value)
      } catch (error) {
        message = (error as Error).message
      }
      assert.match(message, /entry \d is not id:base64/)
      assert.notInclude(message, VALID_KEY.slice(0, 12))
    }
  })

  test('every key committed in .env.example and .env.test is on the public list', async ({
    assert,
  }) => {
    const KEY_NAMES =
      /^(APP_KEY|DATA_ENCRYPTION_KEYS|COURIER_CALLBACK_KEYS|BLIND_INDEX_KEY|HMAC_KEY_\w+)=(.+)$/
    const values: string[] = []
    for (const file of ['.env.example', '.env.test']) {
      const text = await readFile(join(process.cwd(), file), 'utf8')
      for (const line of text.split('\n')) {
        const match = KEY_NAMES.exec(line.trim())
        if (!match) continue
        if (match[1] === 'DATA_ENCRYPTION_KEYS' || match[1] === 'COURIER_CALLBACK_KEYS') {
          values.push(...match[2].split(',').map((entry) => entry.split(':')[1]))
        } else values.push(match[2])
      }
    }
    assert.isAbove(values.length, 10)
    for (const value of values) {
      const hash = createHash('sha256').update(value).digest('hex')
      assert.isTrue(
        PUBLIC_KEY_SHA256.has(hash),
        'a committed key is missing from PUBLIC_KEY_SHA256'
      )
    }
  })

  test('APP_NAME, APP_KEY and DB_POOL_MAX refuse bad values', ({ assert }) => {
    assert.throws(() => envSchema.APP_NAME('APP_NAME', 'Drip Nepal'))
    assert.throws(() => envSchema.APP_KEY('APP_KEY', 'too-short'))
    assert.throws(() => envSchema.DB_POOL_MAX('DB_POOL_MAX', '0'))
    assert.throws(() => envSchema.DB_POOL_MAX('DB_POOL_MAX', '21'))
    assert.equal(envSchema.DB_POOL_MAX('DB_POOL_MAX', '8'), 8)
  })
})
