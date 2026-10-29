import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import Busboy from 'busboy'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  kindForMime,
  extForMime,
  randomStorageName,
  saveStream,
  discardPartial,
  userMediaQuotaBytes,
} from '@/lib/storage'

function mb(n: number): string {
  if (n >= 1024 * 1024 * 1024) return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
  return `${Math.max(1, Math.round(n / (1024 * 1024)))} MB`
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// No body-size cap is declared on purpose: media uploads are streamed to
// disk chunk by chunk, so "too large" is decided by the operator's disk
// (or their reverse proxy), not by this application.

type UploadedMedia = {
  id: string
  kind: string
  filename: string
  mimeType: string
  size: number
  url: string
}

/**
 * POST /api/upload — multipart upload with NO size limit.
 * The request body is streamed through busboy directly to disk, so even
 * multi-gigabyte videos never sit in memory. Each file part must carry a
 * whitelisted MIME type (images / video / audio); anything else aborts
 * the request and the partial file is removed.
 */
export async function POST(req: NextRequest) {
  let storagePath: string | null = null
  try {
    const user = await requireUser(req)

    const contentType = req.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      throw new HttpError(400, 'Expected a multipart/form-data upload.')
    }

    // Per-account media quota: what this user already holds decides the room left.
    const quota = userMediaQuotaBytes()
    const usedAgg = await db.media.aggregate({ _sum: { size: true }, where: { ownerId: user.id } })
    const used = usedAgg._sum.size ?? 0
    if (used >= quota) {
      throw new HttpError(
        413,
        `Your media locker is full — this account holds ${mb(used)} of the ${mb(quota)} allowed here. Remove an old file from a capsule you can still edit, or move the deployment to R2 storage for 5 GB per account (CLOUDFLARE.md → "Photos & videos").`,
      )
    }
    const remaining = quota - used

    const busboy = Busboy({
      headers: { 'content-type': contentType },
      limits: {
        // NOTE: no `fileSize` limit — busboy treats it as unlimited when omitted.
        files: 1,
        fields: 8,
      },
    })

    const result: UploadedMedia = await new Promise<UploadedMedia>((resolve, reject) => {
      let settled = false
      let gotFile = false
      const fail = (err: unknown) => {
        if (settled) return
        settled = true
        if (storagePath) void discardPartial(storagePath)
        reject(err instanceof Error ? err : new HttpError(400, 'Upload failed.'))
      }

      busboy.on('file', (_name, stream, info) => {
        gotFile = true
        try {
          const mime = (info.mimeType || '').toLowerCase().split(';')[0].trim()
          const kind = kindForMime(mime)
          if (!kind) {
            fail(new HttpError(400, 'Unsupported file type. Please upload an image, video, or audio file.'))
            stream.resume()
            return
          }
          const target = randomStorageName(extForMime(mime))
          storagePath = target

          stream.on('limit', () => fail(new HttpError(413, 'Upload stream was cut off.')))
          stream.on('error', (err) => fail(err))

          saveStream(stream, target)
            .then((size) => {
              if (settled) return
              if (size === 0) {
                fail(new HttpError(400, 'The file appears to be empty.'))
                return
              }
              if (size > remaining) {
                fail(new HttpError(413, `That file needs ${mb(size)}, but only ${mb(remaining)} of your ${mb(quota)} media space is left.`))
                return
              }
              return db.media
                .create({
                  data: {
                    ownerId: user.id,
                    kind,
                    filename: (info.filename || 'file').slice(0, 255),
                    storagePath: target,
                    mimeType: mime,
                    size,
                  },
                })
                .then((media) => {
                  settled = true
                  resolve({
                    id: media.id,
                    kind: media.kind,
                    filename: media.filename,
                    mimeType: media.mimeType,
                    size: media.size,
                    url: `/api/media/${media.id}`,
                  })
                })
            })
            .catch(fail)
        } catch (err) {
          fail(err)
        }
      })

      busboy.on('error', fail)
      busboy.on('finish', () => {
        // 'finish' only means multipart parsing ended — our disk write may
        // still be streaming, so fail here only when no file part arrived.
        if (!gotFile && !settled) fail(new HttpError(400, 'No file was received.'))
      })

      if (req.body) {
        Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(busboy)
      } else {
        fail(new HttpError(400, 'Empty request body.'))
      }
    })

    return NextResponse.json({ media: result }, { status: 201 })
  } catch (e) {
    if (storagePath) void discardPartial(storagePath)
    return errorResponse(e)
  }
}
