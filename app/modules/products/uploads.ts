import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { HttpContext } from '@adonisjs/core/http'
import type { MultipartFile } from '@adonisjs/core/bodyparser'

type Request = HttpContext['request']

/*
 * Eight photos of up to 5 MB each, plus the form fields.
 */
const UPLOAD_LIMIT = '45mb'

/*
 * Multipart bodies are not parsed for every route (config/bodyparser.ts,
 * RF-35). The product actions call this after the auth and shop checks have
 * passed, so an anonymous upload is refused before a byte is written.
 * Files land in the OS temp folder, as Adonis's own auto-processing does,
 * and are validated later through `request.validateUsing`.
 */
export async function processUploads(request: Request) {
  if (!request.is(['multipart/form-data'])) return

  request.multipart.onFile('*', { deferValidations: true }, async (part, reportChunk) => {
    const tmpPath = join(tmpdir(), randomUUID())
    part.on('data', reportChunk)
    await pipeline(part, createWriteStream(tmpPath))
    return { tmpPath }
  })

  await request.multipart.process({ limit: UPLOAD_LIMIT })
}

/*
 * Deletes temp files the request did not move to storage, for example after
 * a validation error. Adonis does not remove them on its own.
 */
export async function removeLeftoverUploads(request: Request) {
  const files = Object.values(request.allFiles()).flat() as MultipartFile[]
  await Promise.all(
    files.map((file) => (file.tmpPath ? rm(file.tmpPath, { force: true }) : undefined))
  )
}
