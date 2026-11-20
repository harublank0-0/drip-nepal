import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/*
 * T-OPS-024: the development Compose file keeps the RF-43 fixes of
 * docs/11 §4.3. No password is written in the file (Compose reads
 * DB_PASSWORD from .env and refuses to start without it), every port
 * listens on 127.0.0.1 only, every image is pinned to a minor or patch
 * version (`18.4`, `v1.33.1`; never `latest`, `v1` or `18`), Postgres has a
 * health check and creates `dripnepal_dev`, and Redis starts only with its
 * profile.
 */

type Service = {
  image: string
  ports?: string[]
  environment?: Record<string, string> | string[]
  healthcheck?: { test: string[] }
  profiles?: string[]
}

const file = fileURLToPath(new URL('../../../docker-compose.yml', import.meta.url))
const compose = parse(readFileSync(file, 'utf8')) as {
  services: Record<string, Service>
}
const services = Object.entries(compose.services)

test.group('T-OPS-024 the development Compose file', () => {
  test('T-OPS-024 no password is written in the file', ({ assert }) => {
    const postgres = (compose.services.postgres.environment ?? {}) as Record<string, string>
    assert.equal(postgres.POSTGRES_PASSWORD, '${DB_PASSWORD:?set DB_PASSWORD in .env}')
    for (const [name, service] of services) {
      // The list form (`- KEY=value`) would hide keys from this check.
      assert.isFalse(Array.isArray(service.environment), `${name}: environment as a mapping`)
      for (const [key, value] of Object.entries(service.environment ?? {})) {
        if (/PASSWORD|SECRET|TOKEN|KEY/i.test(key)) {
          assert.match(String(value), /^\$\{[A-Z_]+(?::\?[^}]*)?\}$/, `${name}.${key}`)
        }
      }
    }
  })

  test('T-OPS-024 every port listens on 127.0.0.1 only', ({ assert }) => {
    const ports = services.flatMap(([name, service]) =>
      (service.ports ?? []).map((port) => [name, String(port)] as const)
    )
    assert.isAbove(ports.length, 0)
    for (const [name, port] of ports) assert.match(port, /^127\.0\.0\.1:\d+:\d+$/, name)
  })

  test('T-OPS-024 every image is pinned to a minor or patch version', ({ assert }) => {
    for (const [name, service] of services) {
      const tag = service.image.split('/').at(-1)?.split(':')[1]
      assert.isString(tag, name)
      assert.match(String(tag), /^v?\d+\.\d+(?:\.\d+)?$/, name)
    }
  })

  test('T-OPS-024 Postgres creates dripnepal_dev and has a health check', ({ assert }) => {
    const postgres = compose.services.postgres
    const environment = (postgres.environment ?? {}) as Record<string, string>
    assert.equal(environment.POSTGRES_DB, 'dripnepal_dev')
    assert.include(postgres.healthcheck?.test.join(' ') ?? '', 'pg_isready')
  })

  test('T-OPS-024 Redis starts only with its profile', ({ assert }) => {
    assert.deepEqual(compose.services.redis.profiles, ['redis'])
  })
})
