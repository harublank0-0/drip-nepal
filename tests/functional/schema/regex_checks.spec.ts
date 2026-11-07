import { test } from '@japa/runner'
import db from '@adonisjs/lucid/services/db'

/*
 * T-ARCH-022 (docs/10 §6.2, docs/04 §20.2.2): every regular-expression
 * CHECK accepts its documented valid example.
 *
 * Two traps sit between the SQL in docs/04a and what PostgreSQL stores: Knex
 * turns an unescaped `?` into a `$n` placeholder, and a JavaScript literal
 * drops the backslash of `\.`. Either one corrupts the stored pattern so it
 * rejects every real value. The test reads the patterns back from
 * `pg_constraint`, as PostgreSQL stored them, and matches each documented
 * example against them. It is catalogue-driven: a new regex CHECK without an
 * example here fails the test, so every pattern gets one.
 */

// A ciphertext in the docs/04 §2.9 format: version, key id, 16-character IV,
// ciphertext, 22-character tag.
const CIPHERTEXT = 'v1.k2026.AAAAAAAAAAAAAAAA.c2VhbGVkLXZhbHVl.BBBBBBBBBBBBBBBBBBBBBB'

// One documented valid example per `<table>.<column>` that a regex CHECK tests.
const EXAMPLES: Record<string, string[]> = {
  // docs/04a §9 (Kathmandu: province 3, district 306, metropolitan city 30608)
  'provinces.code': ['3'],
  'districts.code': ['306'],
  'local_levels.code': ['30608'],
  'delivery_zones.code': ['ktm_valley', 'outside_valley'],
  'logistics_providers.code': ['ncm'],
  // docs/04a §5
  'users.phone_last4': ['4567'],
  'users.phone_enc': [CIPHERTEXT],
  'users.mfa_totp_secret_enc': [CIPHERTEXT],
  'user_addresses.recipient_phone_last4': ['4567'],
  'user_addresses.recipient_name_enc': [CIPHERTEXT],
  'user_addresses.recipient_phone_enc': [CIPHERTEXT],
  'user_addresses.area_tole_enc': [CIPHERTEXT],
  'user_addresses.street_landmark_enc': [CIPHERTEXT],
  // docs/04a §15
  'idempotency_keys.actor_scope': [
    '01a1b452-a64a-7a4f-93a2-be6932153cde',
    'provider:esewa',
    'system',
  ],
  'idempotency_keys.operation': ['placeOrder'],
  'idempotency_keys.key': ['f3b0c442-98fc-1c14-9afb'],
  'audit_logs.action': ['shop.suspend', 'platform_setting.update'],
}

type RegexCheck = { table: string; constraint: string; column: string; pattern: string }

// `col ~ 'pattern'::text`, with an optional cast on the column, as
// pg_get_constraintdef prints it. Quotes inside a literal are doubled.
const REGEX_TERM = /\(*([a-z_][a-z0-9_]*)\)?(?:::[a-z ]+)?\s+~\s+'((?:[^']|'')*)'::text/g

async function regexChecks(): Promise<RegexCheck[]> {
  const result = await db.rawQuery(`
    SELECT rel.relname AS table, con.conname AS constraint, pg_get_constraintdef(con.oid) AS definition
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
     WHERE con.contype = 'c' AND nsp.nspname = 'public' AND pg_get_constraintdef(con.oid) LIKE '% ~ %'
     ORDER BY 1, 2
  `)
  const checks: RegexCheck[] = []
  for (const row of result.rows as { table: string; constraint: string; definition: string }[]) {
    const terms = [...row.definition.matchAll(REGEX_TERM)]
    // A definition the parser cannot read must fail loudly, not be skipped.
    if (terms.length === 0) {
      throw new Error(`${row.constraint}: cannot parse ${row.definition}`)
    }
    for (const match of terms) {
      checks.push({
        table: row.table,
        constraint: row.constraint,
        column: match[1],
        pattern: match[2].replaceAll("''", "'"),
      })
    }
  }
  return checks
}

test.group('T-ARCH-022 regular-expression CHECKs', () => {
  test('T-ARCH-022 every regex CHECK accepts its documented example', async ({ assert }) => {
    const checks = await regexChecks()
    assert.isAbove(checks.length, 0, 'the catalogue query finds the regex CHECKs')

    for (const check of checks) {
      const key = `${check.table}.${check.column}`
      const examples = EXAMPLES[key]
      assert.isDefined(examples, `${check.constraint}: add a documented example for ${key}`)
      for (const example of examples!) {
        const result = await db.rawQuery('SELECT ?::text ~ ?::text AS ok', [example, check.pattern])
        assert.isTrue(
          result.rows[0].ok,
          `${check.constraint} rejects its example ${example} (stored pattern ${check.pattern})`
        )
      }
    }
  })

  test('T-ARCH-022 every example belongs to a regex CHECK', async ({ assert }) => {
    const checks = await regexChecks()
    const covered = new Set(checks.map((check) => `${check.table}.${check.column}`))
    for (const key of Object.keys(EXAMPLES)) {
      assert.isTrue(covered.has(key), `${key} has an example but no regex CHECK`)
    }
  })
})
