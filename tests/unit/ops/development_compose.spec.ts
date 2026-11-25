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
 * profile. SeaweedFS (OD-65) publishes only its S3 port; it creates the
 * development buckets `.env.example` names and the test buckets of
 * T-MED-005 at start, creates none on write, and its health check waits
 * for all four; its one credentialed identity is the one `.env.example`
 * names, limited to those buckets; anonymous visitors may only read the
 * public buckets, which `MEDIA_PUBLIC_URL` points at.
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

  test('T-OPS-024 SeaweedFS publishes only S3, waits for its buckets, and matches .env.example', async ({
    assert,
  }) => {
    const seaweedfs = compose.services.seaweedfs
    assert.deepEqual(seaweedfs.ports, ['127.0.0.1:8333:8333'])
    const flags = seaweedfs.command ?? []
    // A write to a bucket not created at start fails, as on R2.
    assert.include(flags, '-s3.autoCreateBucket=false')
    const buckets = (flags.find((flag) => flag.startsWith('-bucket=')) ?? '')
      .slice('-bucket='.length)
      .split(',')
    const example = await readFile(
      fileURLToPath(new URL('../../../.env.example', import.meta.url)),
      'utf8'
    )
    const named = (key: string) => new RegExp(`^${key}=(.*)$`, 'm').exec(example)?.[1] ?? ''
    const devBuckets = [named('S3_BUCKET_PRIVATE'), named('S3_BUCKET_PUBLIC')]
    // The development buckets and the ones T-MED-005 uses, and the health check waits for each.
    const testBuckets = ['dripnepal-test-private', 'dripnepal-test-public']
    assert.sameMembers(buckets, [...devBuckets, ...testBuckets])
    const check = seaweedfs.healthcheck?.test.join(' ') ?? ''
    assert.include(check, '/healthz')
    for (const bucket of buckets) assert.include(check, bucket)
    assert.equal(named('MEDIA_PUBLIC_URL'), `${named('S3_ENDPOINT')}/${named('S3_BUCKET_PUBLIC')}`)

    const config = JSON.parse(
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
    // One identity with credentials, the one .env.example names, which may
    // read, write and list exactly the four buckets.
    const withCredentials = config.identities.filter((identity) => identity.credentials)
    assert.lengthOf(withCredentials, 1)
    assert.deepEqual(withCredentials[0].credentials, [
      { accessKey: named('S3_ACCESS_KEY_ID'), secretKey: named('S3_SECRET_ACCESS_KEY') },
    ])
    assert.sameMembers(
      withCredentials[0].actions,
      buckets.flatMap((bucket) => ['Read', 'Write', 'List'].map((action) => `${action}:${bucket}`))
    )
    // Anonymous visitors may only read the two public buckets.
    const anonymous = config.identities.find((identity) => identity.name === 'anonymous')
    assert.sameMembers(anonymous?.actions ?? [], [
      `Read:${named('S3_BUCKET_PUBLIC')}`,
      'Read:dripnepal-test-public',
    ])
  })
})
