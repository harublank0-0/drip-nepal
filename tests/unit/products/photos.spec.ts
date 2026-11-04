import { test } from '@japa/runner'
import sharp from 'sharp'
import { PHOTO_WIDTHS, PhotoRejected, processProductPhoto } from '#modules/products/photos'

/*
 * T-MED-001 for the v1 store: a product photo is checked by its content,
 * re-encoded as WebP at the widths of AC-FR-MED-001-2 that v1 uses, and
 * loses all metadata (a phone photo's GPS would publish where the seller
 * took it). Images are made here with sharp, so no binary fixtures.
 */

function photo(width: number, height: number) {
  return sharp({ create: { width, height, channels: 3, background: '#a33' } })
}

async function sizeOf(data: Buffer) {
  const info = await sharp(data).metadata()
  return { format: info.format, width: info.width, height: info.height, exif: info.exif }
}

async function rejection(input: Buffer) {
  const error = await processProductPhoto(input).then(
    () => null,
    (caught) => caught
  )
  if (!(error instanceof PhotoRejected)) throw new Error(`Expected PhotoRejected, got ${error}`)
  return error.message
}

test.group('T-MED-001 product photos [v1]', (group) => {
  group.tap((t) => t.tags(['@v1']).timeout(20_000))

  test('a phone photo becomes a 1600 px and a 640 px WebP', async ({ assert }) => {
    const input = await photo(4000, 3000).jpeg({ quality: 90 }).toBuffer()

    const { large, small } = await processProductPhoto(input)

    assert.deepEqual(await sizeOf(large.data), {
      format: 'webp',
      width: PHOTO_WIDTHS.large,
      height: 1200,
      exif: undefined,
    })
    assert.deepEqual(await sizeOf(small.data), {
      format: 'webp',
      width: PHOTO_WIDTHS.small,
      height: 480,
      exif: undefined,
    })
    assert.deepEqual([large.width, large.height, small.width, small.height], [1600, 1200, 640, 480])
  })

  test('GPS and other EXIF metadata are removed', async ({ assert }) => {
    const input = await photo(1200, 900)
      .withExif({
        IFD0: { Make: 'PhoneMaker', Model: 'Phone 9' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '27/1 42/1 0/1' },
      })
      .jpeg()
      .toBuffer()
    const inputInfo = await sharp(input).metadata()
    assert.isDefined(inputInfo.exif, 'the input carries EXIF')

    const { large, small } = await processProductPhoto(input)

    const largeInfo = await sizeOf(large.data)
    const smallInfo = await sizeOf(small.data)
    assert.isUndefined(largeInfo.exif)
    assert.isUndefined(smallInfo.exif)
    assert.notInclude(large.data.toString('latin1'), 'PhoneMaker')
  })

  test('a small photo is never enlarged', async ({ assert }) => {
    const input = await photo(500, 400).png().toBuffer()

    const { large, small } = await processProductPhoto(input)

    assert.deepEqual([large.width, large.height, small.width, small.height], [500, 400, 500, 400])
  })

  test('a photo taken sideways is turned upright', async ({ assert }) => {
    // Stored 400x200 with EXIF orientation 6: it displays 200 wide, 400 tall.
    const input = await photo(400, 200).withMetadata({ orientation: 6 }).jpeg().toBuffer()

    const { large } = await processProductPhoto(input)

    assert.deepEqual([large.width, large.height], [200, 400])
  })

  test('WebP and PNG uploads are accepted too', async ({ assert }) => {
    for (const input of [
      await photo(800, 600).webp().toBuffer(),
      await photo(800, 600).png().toBuffer(),
    ]) {
      const { large } = await processProductPhoto(input)
      const output = await sizeOf(large.data)
      assert.equal(output.format, 'webp')
    }
  })

  test('a file that is not a JPEG, PNG or WebP is refused: {case}')
    .with([
      {
        case: 'an HTML page renamed .jpg',
        make: async () => Buffer.from('<html><body>hi</body></html>'),
      },
      {
        case: 'an SVG renamed .png',
        make: async () =>
          Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'),
      },
      { case: 'a GIF', make: () => photo(20, 20).gif().toBuffer() },
      { case: 'an empty file', make: async () => Buffer.alloc(0) },
    ])
    .run(async ({ assert }, { make }) => {
      assert.equal(await rejection(await make()), "This photo isn't a JPEG, PNG or WebP image.")
    })

  test('a photo over 40 megapixels is refused before it is decoded', async ({ assert }) => {
    const input = await photo(8000, 5100).png({ compressionLevel: 1 }).toBuffer()

    assert.equal(
      await rejection(input),
      'This photo is too large (over 40 megapixels). Resize it and try again.'
    )
  })

  test('a damaged photo is refused', async ({ assert }) => {
    const whole = await photo(1200, 900).jpeg().toBuffer()

    assert.equal(
      await rejection(whole.subarray(0, Math.floor(whole.length / 2))),
      "This photo couldn't be read. It may be damaged; try exporting it again."
    )
  })
})
