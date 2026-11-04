import drive from '@adonisjs/drive/services/main'
import { randomCode } from '#utils/random'
import { PHOTO_WIDTHS, processProductPhoto } from '#modules/products/photos'

/*
 * A product photo as stored: its two WebP files. The original upload is
 * never stored.
 */
export type StoredPhotoFiles = {
  key: string
  url: string
  thumbnailKey: string
  thumbnailUrl: string
  width: number
  height: number
}

export async function deletePhotoFiles(keys: string[]) {
  for (const key of keys) {
    await drive
      .use()
      .delete(key)
      .catch(() => {})
  }
}

/*
 * Resizes a photo (photos.ts) and writes the 1600 px and 640 px WebP files
 * under `folder`. Throws PhotoRejected for a file that can't be used.
 * Everything that can fail without touching storage (resizing, building the
 * URLs) happens before the first write, and if the second write fails the
 * first file is deleted, so a failure never leaves files behind.
 */
export async function storeProductPhoto(folder: string, input: Buffer): Promise<StoredPhotoFiles> {
  const photo = await processProductPhoto(input)
  const base = `${folder}/${randomCode(20)}`
  const key = `${base}-${PHOTO_WIDTHS.large}.webp`
  const thumbnailKey = `${base}-${PHOTO_WIDTHS.small}.webp`
  const url = await drive.use().getUrl(key)
  const thumbnailUrl = await drive.use().getUrl(thumbnailKey)

  await drive.use().put(key, photo.large.data, { contentType: 'image/webp' })
  try {
    await drive.use().put(thumbnailKey, photo.small.data, { contentType: 'image/webp' })
  } catch (error) {
    await deletePhotoFiles([key])
    throw error
  }

  return {
    key,
    url,
    thumbnailKey,
    thumbnailUrl,
    width: photo.large.width,
    height: photo.large.height,
  }
}
