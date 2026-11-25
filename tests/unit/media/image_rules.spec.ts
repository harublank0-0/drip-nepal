import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { sniffImageType } from '#modules/media/domain/magic_bytes'
import { derivedKey, finalKey, uploadKey } from '#modules/media/domain/media_keys'
import { DERIVED_WIDTHS, derivedWidthsFor } from '#modules/media/domain/media_limits'

/*
 * The worker's pure rules (docs/03 §7.5, ADR-0013 decision 3, 07 TM-15;
 * R1-S part 2d-ii):
 *
 * - T-SEC-018: the magic bytes decide before sharp: JPEG, PNG and WebP are
 *   known; SVG, HTML, GIF, TIFF, HEIC, AVIF, PDF and too-short input are
 *   not; and the lockfile resolves sharp at 0.35.4 or later (09 §10.6).
 * - T-MED-001: derivatives at 320, 640, 1024 and 1600 px, never wider than
 *   the image, and one at its own width when it is narrower than 320; the
 *   final key differs from the upload key, and the derived keys are
 *   content-addressed.
 */
const bytes = (...values: number[]) => Uint8Array.from(values)
const text = (value: string) => new TextEncoder().encode(value)

test.group('T-SEC-018 magic bytes and the sharp version', () => {
  test('T-SEC-018 {name} is {expected}')
    .with([
      { name: 'a JPEG', input: bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10), expected: 'image/jpeg' },
      {
        name: 'a PNG',
        input: bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d),
        expected: 'image/png',
      },
      {
        name: 'a WebP',
        input: Uint8Array.from([...text('RIFF'), 0x24, 0, 0, 0, ...text('WEBPVP8 ')]),
        expected: 'image/webp',
      },
      { name: 'an SVG', input: text('<svg xmlns="http://www.w3.org/2000/svg"/>'), expected: null },
      { name: 'an HTML page', input: text('<!doctype html><script>x</script>'), expected: null },
      { name: 'a GIF', input: text('GIF89a\u0001\u0000\u0001\u0000'), expected: null },
      { name: 'a TIFF', input: bytes(0x49, 0x49, 0x2a, 0, 8, 0, 0, 0), expected: null },
      {
        name: 'a HEIC',
        input: Uint8Array.from([0, 0, 0, 0x18, ...text('ftypheic')]),
        expected: null,
      },
      {
        name: 'an AVIF',
        input: Uint8Array.from([0, 0, 0, 0x1c, ...text('ftypavif')]),
        expected: null,
      },
      { name: 'a PDF', input: text('%PDF-1.7\n'), expected: null },
      {
        name: 'a RIFF that is not WebP',
        input: text('RIFF$\u0000\u0000\u0000WAVE'),
        expected: null,
      },
      { name: 'two bytes of a JPEG', input: bytes(0xff, 0xd8), expected: null },
      { name: 'nothing', input: bytes(), expected: null },
    ])
    .run(({ assert }, row) => {
      assert.strictEqual(sniffImageType(row.input), row.expected)
    })

  test('T-SEC-018 the lockfile resolves sharp at 0.35.4 or later, and 0.35 only', async ({
    assert,
  }) => {
    const lock = parse(
      await readFile(fileURLToPath(new URL('../../../pnpm-lock.yaml', import.meta.url)), 'utf8')
    ) as { packages: Record<string, unknown> }
    const versions = Object.keys(lock.packages)
      .filter((name) => name.startsWith('sharp@'))
      .map((name) => name.slice('sharp@'.length))
    assert.isAbove(versions.length, 0)
    for (const version of versions) {
      const [major, minor, patch] = version.split('.').map(Number)
      assert.equal(major, 0, version)
      assert.equal(minor, 35, version)
      assert.isAtLeast(patch, 4, version)
    }
  })
})

test.group('T-MED-001 derivative widths and keys', () => {
  test('T-MED-001 an image {width} px wide gets derivatives at {widths}')
    .with([
      { width: 4000, widths: [...DERIVED_WIDTHS] },
      { width: 1600, widths: [320, 640, 1024, 1600] },
      { width: 1599, widths: [320, 640, 1024] },
      { width: 640, widths: [320, 640] },
      { width: 320, widths: [320] },
      { width: 200, widths: [200] },
      { width: 1, widths: [1] },
    ])
    .run(({ assert }, row) => {
      assert.deepEqual(derivedWidthsFor(row.width), row.widths)
    })

  test('T-MED-001 the final key is not the upload key; derived keys are content-addressed', ({
    assert,
  }) => {
    const shop = '01929a50-0000-7000-8000-000000000001'
    const asset = '01929a50-0000-7000-8000-0000000000a1'
    const sha = 'ab'.repeat(32)
    assert.equal(uploadKey(shop, asset), `originals/${shop}/${asset}`)
    assert.equal(finalKey(shop, asset), `originals/${shop}/${asset}/v1`)
    assert.notEqual(finalKey(shop, asset), uploadKey(shop, asset))
    assert.equal(derivedKey(asset, sha, 640), `p/${asset}/${'ab'.repeat(8)}-640.webp`)
    assert.notEqual(derivedKey(asset, 'cd'.repeat(32), 640), derivedKey(asset, sha, 640))
  })
})
