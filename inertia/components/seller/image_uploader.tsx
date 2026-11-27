import { useEffect, useRef, useState } from 'react'
import { MEDIA_UPLOAD_LIMITS } from '@shared/constants/limits'
import { retryWaitSeconds } from '@shared/ui/retry_wait'
import { MAX_GALLERY, fileProblem, maxUploadMegabytes, roomLeft } from '@shared/ui/product_media'
import { client } from '~/client'
import { useApiMutation } from '~/hooks/use_api_mutation'
import { announce } from '~/lib/announce'
import { PENDING_BUTTON } from '~/lib/forms'
import { t } from '~/lib/i18n'
import { Button } from '~/components/ui/button'
import { Progress } from '~/components/ui/progress'
import { TextField } from '~/components/forms/text_field'
import { RateLimitNotice } from '~/components/forms/rate_limit_notice'

/*
 * `ImageUploader` (docs/08 §4.3; ADR-0013; 02 J-10 step 5; R1-S part 2g-ii):
 * the files a seller chooses, uploaded one at a time straight to storage.
 *
 * Each file asks for its presigned URL only when its turn comes
 * (`createMediaUpload`), so the URL's 10 minutes hold on a slow link;
 * the browser PUTs the bytes with the signed `headers`, showing progress,
 * then `completeMediaUpload` hands the object to the worker, and the
 * uploader polls `getMediaUpload` every 2 seconds, for at most 2 minutes,
 * until the image is `ready` (its derivatives exist) or `rejected` (with
 * the reason the seller sees). 2 seconds keeps a whole gallery well inside
 * `api_user`'s 300 requests a minute (06 §9.1). A ready image goes to the
 * gallery through `onReady`; a failure keeps the file with "Try again",
 * which starts its upload over with a new URL. "Remove" takes any file out
 * of the queue, stopping its upload. A PUT that makes no progress for 60
 * seconds is stopped as failed, so a stalled link never holds the queue.
 *
 * The calls go through `useApiMutation`, so the page-level codes of 08 §8.3
 * apply: `UNAUTHENTICATED` visits the sign-in page, and `RATE_LIMITED`
 * pauses the queue until `Retry-After` has passed, the file kept waiting.
 *
 * Each file is previewed with an object URL (`blob:`, 08 note 56) while it
 * uploads, with its alt text to write meanwhile, which the gallery takes
 * with the image (`onReady` hands the URL over); the gallery revokes it
 * when the photos are saved, the image is removed or the page goes. A file of another
 * type or above the size limit is refused before any request (`fileProblem`).
 */
export type ReadyImage = {
  assetId: string
  keys: Record<string, string> | null
  preview: string
  // The alt text written while the file uploaded.
  alt: string
  // Whether the seller was typing that alt text, so the gallery's field takes the focus.
  focused: boolean
}

type UploadState = 'waiting' | 'uploading' | 'finishing' | 'processing' | 'rejected' | 'failed'

type Upload = {
  id: string
  file: File
  preview: string
  state: UploadState
  progress: number
  reason: string | null
  alt: string
}

const POLL_MS = 2000
const POLL_LIMIT_MS = 120_000
// A PUT with no progress for this long is stopped [Assumption, 08 §8.4 slow links].
const STALL_MS = 60_000
const ADD_ID = 'photos-add'
const RATE_LIMIT_ID = 'photos-upload-rate-limit'

const STATE_LABEL: Record<UploadState, Parameters<typeof t>[0]> = {
  waiting: 'seller.photos.state.waiting',
  uploading: 'seller.photos.state.uploading',
  finishing: 'seller.photos.state.finishing',
  processing: 'seller.photos.state.processing',
  rejected: 'seller.photos.state.rejected',
  failed: 'seller.photos.state.failed',
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

type ImageType = (typeof MEDIA_UPLOAD_LIMITS.imageTypes)[number]

// The bodies of `createMediaUpload` and `completeMediaUpload` (`MediaUpload`, `SellerMediaAsset`):
// their controllers send through `response`, so the typed client cannot infer them.
type CreatedUpload = {
  data: { media_asset_id: string; upload_url: string; headers: Record<string, string> }
}
type FinishedUpload = { data: { status: string; rejection_reason: string | null } }

const MEGABYTE = 1_048_576

// "2.4 MB", "830 KB", in the units of the size limit.
function sizeText(bytes: number) {
  return bytes >= MEGABYTE
    ? t('seller.photos.size_mb', { size: String(Math.round((bytes / MEGABYTE) * 10) / 10) })
    : t('seller.photos.size_kb', { size: Math.max(1, Math.round(bytes / 1024)) })
}

/*
 * The PUT to storage with progress; resolves with storage's HTTP status, or
 * 0 when nothing came back: a network failure, an abort, or no progress for
 * `STALL_MS`. `register` receives the request, so "Remove" and leaving the
 * page can abort it.
 */
function putFile(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress: (fraction: number) => void,
  register: (request: XMLHttpRequest | null) => void
) {
  return new Promise<number>((resolve) => {
    const request = new XMLHttpRequest()
    let lastProgress = Date.now()
    const stall = window.setInterval(() => {
      if (Date.now() - lastProgress > STALL_MS) request.abort()
    }, 5000)
    const settle = (status: number) => {
      window.clearInterval(stall)
      register(null)
      resolve(status)
    }
    request.open('PUT', url)
    for (const [name, value] of Object.entries(headers)) request.setRequestHeader(name, value)
    request.upload.onprogress = (event) => {
      lastProgress = Date.now()
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    request.onload = () => settle(request.status)
    request.onerror = () => settle(0)
    request.onabort = () => settle(0)
    register(request)
    request.send(file)
  })
}

export function ImageUploader({
  shopSlug,
  galleryCount,
  onReady,
  onBusyChange,
}: {
  shopSlug: string
  // The images in the gallery, saved or not; the room left counts them and these files.
  galleryCount: number
  onReady: (image: ReadyImage) => void
  // Whether any file is still on its way, so the gallery waits before saving.
  onBusyChange: (busy: boolean) => void
}) {
  const mutation = useApiMutation()
  const [uploads, setUploads] = useState<Upload[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [focusTarget, setFocusTarget] = useState<{ id: string; turn: number } | null>(null)
  const running = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  // The latest list, for the queue that runs outside React's renders.
  const current = useRef<Upload[]>([])
  useEffect(() => {
    current.current = uploads
  })
  const mounted = useRef(true)
  // The files removed while their upload ran, and each running PUT, to stop it.
  const removed = useRef(new Set<string>())
  const requests = useRef(new Map<string, XMLHttpRequest>())
  // Epoch milliseconds until which RATE_LIMITED holds the queue.
  const pausedUntil = useRef(0)
  // Set on UNAUTHENTICATED: the sign-in page is on its way, so no other file starts.
  const stopped = useRef(false)
  // Whether RATE_LIMITED holds the queue: waiting files then do not hold up a save.
  const [held, setHeld] = useState(false)

  const busy = uploads.some(
    (upload) =>
      ['uploading', 'finishing', 'processing'].includes(upload.state) ||
      (upload.state === 'waiting' && !held)
  )
  const left = roomLeft(galleryCount, uploads.length)
  const sizeLimit = maxUploadMegabytes()
  useEffect(() => {
    onBusyChange(busy)
  }, [busy, onBusyChange])

  useEffect(() => {
    if (focusTarget) document.getElementById(focusTarget.id)?.focus()
  }, [focusTarget])

  useEffect(() => {
    mounted.current = true
    const puts = requests.current
    return () => {
      mounted.current = false
      for (const request of puts.values()) request.abort()
      for (const upload of current.current) URL.revokeObjectURL(upload.preview)
    }
  }, [])

  const alive = (id: string) => mounted.current && !removed.current.has(id)

  function patch(id: string, change: Partial<Upload>) {
    if (!alive(id)) return
    setUploads((list) =>
      list.map((upload) => (upload.id === id ? { ...upload, ...change } : upload))
    )
  }

  function fail(upload: Upload, state: 'rejected' | 'failed', reason: string) {
    if (!alive(upload.id)) return
    // A refused file loses its alt text field: focus moves to its "Remove".
    if (state === 'rejected' && document.activeElement?.id === `upload-${upload.id}-alt`) {
      focusAfter(`upload-${upload.id}-remove`)
    }
    patch(upload.id, { state, reason, progress: 0 })
    announce(t('seller.photos.announce_failed', { name: upload.file.name }))
  }

  function focusAfter(id: string) {
    setFocusTarget((previous) => ({ id, turn: (previous?.turn ?? 0) + 1 }))
  }

  function stop() {
    stopped.current = true
  }

  // The file goes back to the queue, which waits until `Retry-After` has passed.
  function pause(upload: Upload, retryAfter: unknown) {
    pausedUntil.current = Date.now() + retryWaitSeconds(retryAfter) * 1000
    setHeld(true)
    patch(upload.id, { state: 'waiting', progress: 0 })
  }

  // One file, start to finish; it stops wherever the file is removed or the page goes.
  async function uploadOne(upload: Upload) {
    const id = upload.id
    patch(id, { state: 'uploading', progress: 0, reason: null })
    let assetId = ''
    for (let attempt = 0; ; attempt++) {
      const created = await mutation.run(() =>
        client.request('createMediaUpload', {
          params: { shopSlug },
          // fileProblem refused any other type before the file was queued.
          body: {
            kind: 'product_image',
            mime: upload.file.type as ImageType,
            bytes: upload.file.size,
          },
          timeout: 30_000,
        })
      )
      if (!alive(id)) return
      // Null: RATE_LIMITED still holds the calls.
      if (!created) return pause(upload, 1)
      if (!created.ok) {
        if ('offline' in created) return fail(upload, 'failed', t('common.form.offline'))
        const { problem } = created
        if (problem.code === 'UNAUTHENTICATED') return stop()
        if (problem.code === 'RATE_LIMITED') return pause(upload, problem.retry_after_seconds)
        return fail(upload, 'failed', problem.detail ?? t('common.form.failed'))
      }
      const started = (created.data as unknown as CreatedUpload).data
      assetId = started.media_asset_id
      const status = await putFile(
        started.upload_url,
        started.headers,
        upload.file,
        (fraction) => patch(id, { progress: Math.round(fraction * 100) }),
        (request) => {
          if (request) requests.current.set(id, request)
          else requests.current.delete(id)
        }
      )
      if (!alive(id)) return
      if (status >= 200 && status < 300) break
      // Storage answers 403 to a URL that expired on a slow link: a new one is asked for once
      // (08 §4.3); the asset left without its bytes is `media.cleanup_abandoned`'s (03 §9).
      if (status === 403 && attempt === 0) {
        patch(id, { progress: 0 })
        continue
      }
      return fail(upload, 'failed', t('seller.photos.put_failed'))
    }
    patch(id, { state: 'finishing', progress: 100 })
    // The bytes are stored: RATE_LIMITED waits and finishes again rather than failing the file.
    let finished
    for (;;) {
      finished = await mutation.run(() =>
        client.request('completeMediaUpload', {
          params: { shopSlug, mediaAssetId: assetId },
          timeout: 30_000,
        })
      )
      if (!alive(id)) return
      const limited =
        finished === null ||
        (!finished.ok && 'problem' in finished && finished.problem.code === 'RATE_LIMITED')
      if (!limited) break
      const retryAfter =
        finished && !finished.ok && 'problem' in finished ? finished.problem.retry_after_seconds : 1
      await wait(retryWaitSeconds(retryAfter) * 1000)
      if (!alive(id)) return
    }
    if (!finished) return
    if (!finished.ok) {
      if ('offline' in finished) return fail(upload, 'failed', t('common.form.offline'))
      if (finished.problem.code === 'UNAUTHENTICATED') return stop()
      return fail(upload, 'failed', finished.problem.detail ?? t('common.form.failed'))
    }
    const asset = (finished.data as unknown as FinishedUpload).data
    if (asset.status === 'rejected') {
      return fail(upload, 'rejected', asset.rejection_reason ?? t('common.form.failed'))
    }
    patch(id, { state: 'processing' })
    const startedAt = Date.now()
    let serverErrors = 0
    while (Date.now() - startedAt < POLL_LIMIT_MS) {
      await wait(Math.max(POLL_MS, pausedUntil.current - Date.now()))
      if (!alive(id)) return
      const read = await mutation.run(() =>
        client.request('getMediaUpload', {
          params: { shopSlug, mediaAssetId: assetId },
          timeout: 15_000,
        })
      )
      if (!alive(id)) return
      // A network failure, or RATE_LIMITED holding the calls, is tried again on the next tick.
      if (!read || (!read.ok && 'offline' in read)) continue
      if (!read.ok) {
        const { problem } = read
        if (problem.code === 'UNAUTHENTICATED') return stop()
        if (problem.code === 'RATE_LIMITED') {
          pausedUntil.current = Date.now() + retryWaitSeconds(problem.retry_after_seconds) * 1000
          continue
        }
        // A passing server error is read again; the third in one poll fails the file (08 §8.4).
        if (problem.status >= 500 && ++serverErrors < 3) continue
        return fail(upload, 'failed', problem.detail ?? t('common.form.failed'))
      }
      const polled = read.data.data
      if (polled.status === 'ready') {
        const typed = current.current.find((item) => item.id === id)
        onReady({
          assetId,
          keys: polled.keys,
          preview: upload.preview,
          alt: typed?.alt ?? '',
          focused: document.activeElement?.id === `upload-${id}-alt`,
        })
        // The gallery owns the preview now; the uploader forgets the file.
        setUploads((list) => list.filter((item) => item.id !== id))
        announce(t('seller.photos.announce_ready', { name: upload.file.name }))
        return
      }
      if (polled.status === 'rejected') {
        return fail(upload, 'rejected', polled.rejection_reason ?? t('common.form.failed'))
      }
    }
    fail(upload, 'failed', t('seller.photos.too_slow'))
  }

  // Runs the waiting files one at a time (08 §10.4: one at a time on slow links).
  async function runQueue() {
    if (running.current) return
    running.current = true
    try {
      for (;;) {
        if (!mounted.current || stopped.current) break
        const holdFor = pausedUntil.current - Date.now()
        if (holdFor > 0) {
          await wait(holdFor)
          continue
        }
        setHeld(false)
        const next = current.current.find(
          (upload) => upload.state === 'waiting' && !removed.current.has(upload.id)
        )
        if (!next) break
        await uploadOne(next)
        // Let React apply the last patch before the next look at the list.
        await wait(0)
      }
    } finally {
      running.current = false
    }
  }

  useEffect(() => {
    if (uploads.some((upload) => upload.state === 'waiting')) void runQueue()
    // runQueue reads the list through `current`; it only needs a nudge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploads])

  function choose(files: FileList | null) {
    if (!files) return
    const refused: string[] = []
    const accepted: Upload[] = []
    for (const file of [...files]) {
      const problem = fileProblem(file)
      if (problem) {
        refused.push(
          problem === 'type'
            ? t('seller.photos.refused_type', { name: file.name })
            : t('seller.photos.refused_size', { name: file.name, size: sizeLimit })
        )
        continue
      }
      if (accepted.length >= left) {
        refused.push(t('seller.photos.refused_room', { name: file.name, max: MAX_GALLERY }))
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        file,
        preview: URL.createObjectURL(file),
        state: 'waiting',
        progress: 0,
        reason: null,
        alt: '',
      })
    }
    setNotice(refused.length > 0 ? refused.join(' ') : null)
    if (accepted.length > 0) setUploads((list) => [...list, ...accepted])
    if (inputRef.current) inputRef.current.value = ''
  }

  function retry(upload: Upload) {
    patch(upload.id, { state: 'waiting', reason: null, progress: 0 })
    // The pressed button goes; the file's alt text field stays.
    focusAfter(`upload-${upload.id}-alt`)
  }

  function remove(upload: Upload) {
    removed.current.add(upload.id)
    requests.current.get(upload.id)?.abort()
    URL.revokeObjectURL(upload.preview)
    const index = uploads.findIndex((item) => item.id === upload.id)
    const rest = uploads.filter((item) => item.id !== upload.id)
    // A functional update, so a change the queue made since this render is kept.
    setUploads((list) => list.filter((item) => item.id !== upload.id))
    // The next file's "Remove", or the previous one's, or "Add photos" (08 §9.1 "Item removed").
    const neighbour = rest[Math.min(index, rest.length - 1)]
    focusAfter(neighbour ? `upload-${neighbour.id}-remove` : ADD_ID)
    announce(t('seller.photos.announce_removed', { name: upload.file.name }))
  }

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        id="photos-file"
        type="file"
        accept={MEDIA_UPLOAD_LIMITS.imageTypes.join(',')}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => choose(event.target.files)}
      />
      <Button
        id={ADD_ID}
        type="button"
        variant="outline"
        className={`h-11 text-base md:h-9 md:text-sm ${PENDING_BUTTON}`}
        aria-describedby="photos-add-help"
        onClick={() => {
          if (left > 0) inputRef.current?.click()
        }}
        aria-disabled={left === 0 || undefined}
      >
        {t('seller.photos.add')}
      </Button>
      <p id="photos-add-help" className="text-muted-foreground text-sm">
        {left === 0
          ? t('seller.photos.full')
          : t('seller.photos.add_help', { room: left, size: sizeLimit })}
      </p>
      <RateLimitNotice id={RATE_LIMIT_ID} seconds={mutation.retryIn} />
      {notice && (
        <p role="alert" className="text-destructive text-sm">
          {notice}
        </p>
      )}
      {uploads.length > 0 && (
        <ul className="space-y-2" aria-label={t('seller.photos.uploads_label')}>
          {uploads.map((upload) => (
            <li key={upload.id} className="flex items-start gap-3 rounded-md border p-3">
              <img src={upload.preview} alt="" className="size-14 shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm font-medium break-all">{upload.file.name}</p>
                <p className="text-muted-foreground text-xs">
                  {t('seller.photos.size_state', {
                    size: sizeText(upload.file.size),
                    state: t(STATE_LABEL[upload.state]),
                  })}
                </p>
                {upload.state === 'uploading' && (
                  <Progress
                    value={upload.progress}
                    aria-label={t('seller.photos.progress_label', { name: upload.file.name })}
                  />
                )}
                {upload.reason && <p className="text-destructive text-sm">{upload.reason}</p>}
                {upload.state !== 'rejected' && (
                  <TextField
                    id={`upload-${upload.id}-alt`}
                    label={t('seller.photos.upload_alt', { name: upload.file.name })}
                    value={upload.alt}
                    errors={[]}
                    onChange={(value) => patch(upload.id, { alt: value })}
                    onBlur={() => undefined}
                  />
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  {upload.state === 'failed' && (
                    <Button type="button" variant="outline" size="sm" onClick={() => retry(upload)}>
                      {t('seller.photos.retry')}
                      <span className="sr-only"> {upload.file.name}</span>
                    </Button>
                  )}
                  <Button
                    id={`upload-${upload.id}-remove`}
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(upload)}
                  >
                    {t('seller.photos.remove_upload')}
                    <span className="sr-only"> {upload.file.name}</span>
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
