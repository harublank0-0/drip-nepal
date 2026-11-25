import { test } from '@japa/runner'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/*
 * T-OPS-024: the development Compose file keeps the RF-43 fixes of
 * docs/11 §4.3. No password is written in the file (Compose reads
 * DB_PASSWORD from .env and refuses to start without it), every port
 * listens on 127.0.0.1 only, every image is pinned to a minor or patch
 * version (`18.4`, `v1.33.1`; never `latest`, `v1` or `18`), Postgres has a
 * health check and creates `dripnepal_dev`, and Redis starts only with its
 * profile. SeaweedFS (OD-65) publishes only its S3 port, has a health check,
 * creates the buckets `.env.example` names and no others, knows the
 * credentials `.env.example` names, and lets anonymous visitors only read
 * the public buckets, which `MEDIA_PUBLIC_URL` points at.
 */

type Service = {
  image: string
  ports?: string[]
  environment?: Record<string, string> | string[]
  healthcheck?: { test: string[] }
  profiles?: string[]
  command?: string[]
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

  test('T-OPS-024 SeaweedFS publishes only S3, creates the buckets .env.example names, makes no others', async ({
    assert,
  }) => {
    const seaweedfs = compose.services.seaweedfs
    assert.deepEqual(seaweedfs.ports, ['127.0.0.1:8333:8333'])
    assert.include(seaweedfs.healthcheck?.test.join(' ') ?? '', '/healthz')
    const flags = seaweedfs.command ?? []
    assert.include(flags, '-s3.autoCreateBucket=false')
    const buckets = flags.find((flag) => flag.startsWith('-bucket='))?.slice('-bucket='.length)
    const example = await readFile(
      fileURLToPath(new URL('../../../.env.example', import.meta.url)),
      'utf8'
    )
    const named = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(example)?.[1]
    assert.includeMembers(buckets?.split(',') ?? [], [
      named('S3_BUCKET_PRIVATE'),
      named('S3_BUCKET_PUBLIC'),
    ])
    // The credentials .env.example names are the ones the server knows.
    const identities = JSON.parse(
      await readFile(
        fileURLToPath(new URL('../../../docker/seaweedfs/s3.json', import.meta.url)),
        'utf8'
      )
    ) as {
      identities: Array<{
        name: string
        credentials?: Array<{ accessKey: string; secretKey: string }>
        actions: string[]
      }>
    }
    const app = identities.identities.find((identity) => identity.credentials)
    assert.deepEqual(app?.credentials, [
      { accessKey: named('S3_ACCESS_KEY_ID'), secretKey: named('S3_SECRET_ACCESS_KEY') },
    ])
    // Anonymous visitors may only read the public buckets.
    const anonymous = identities.identities.find((identity) => identity.name === 'anonymous')
    for (const action of anonymous?.actions ?? [])
      assert.match(action, /^Read:dripnepal-\w+-public$/)
    assert.equal(named('MEDIA_PUBLIC_URL'), `${named('S3_ENDPOINT')}/${named('S3_BUCKET_PUBLIC')}`)
  })
})
