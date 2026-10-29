import type { Readable } from 'stream'
import { HttpError } from '@/lib/auth'
import { db } from '@/lib/db'
import { env, onCloudflare } from '@/lib/env'

/**
 * Storage layer — three interchangeable backends behind one API:
 *
 *  - Cloudflare Workers + R2 binding (`UPLOADS`): objects stored under a
 *    plain key. Range reads map to R2's native range queries. The premium
 *    path — needs R2 activated on the Cloudflare account.
 *  - Cloudflare Workers without R2: files live INSIDE the D1 database as
 *    fixed-size chunks (MediaChunk table). Works on the free tier with zero
 *    extra setup — uploads simply work. Range reads fetch exactly the
 *    chunks needed, so video seeking still works. Capped per file because
 *    the free database pool is finite.
 *  - Self-hosted Node (Windows / Linux / Docker): streamed straight to the
 *    directory behind UPLOAD_DIR (never fully buffered in memory), with
 *    byte-range reads. No practical size limit.
 *
 * Files never live in /public — every byte is served through the
 * access-checked media gateway.
 *
 * DB note: historical self-host rows store an ABSOLUTE path; new rows store
 * a plain file name. The local backend accepts both; the R2 and D1 backends
 * use the base name as the object key / chunk grouping.
 */

/** R2 path: Cloudflare free-tier request bodies cap around 100 MB. */
const R2_MAX_BYTES = 90 * 1024 * 1024

/**
 * D1 path: free Cloudflare databases hold ~500 MB in total, so keep each
 * file well inside what one video should cost the pool. 64 KB chunks keep
 * every write comfortably small; a 48 MB file = 768 chunk rows.
 */
const D1_MAX_BYTES = 48 * 1024 * 1024
const D1_CHUNK_SIZE = 64 * 1024

const FIVE_GB = 5 * 1024 * 1024 * 1024
/** Free D1 pool holds ~500 MB for the WHOLE deployment (app rows included) —
 *  so a per-account share that lets several keepers use the same database. */
const D1_USER_QUOTA = 250 * 1024 * 1024

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
  'image/heic': '.heic',
  'image/svg+xml': '.svg',
}

export const VIDEO_TYPES: Record<string, string> = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'video/quicktime': '.mov',
  'video/x-matroska': '.mkv',
  'video/x-msvideo': '.avi',
  'video/mpeg': '.mpeg',
  'video/3gpp': '.3gp',
  'audio/mpeg': '.mp3',
  'audio/mp4': '.m4a',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
}

export function kindForMime(mime: string): 'IMAGE' | 'VIDEO' | null {
  const m = (mime || '').toLowerCase().split(';')[0].trim()
  if (m in IMAGE_TYPES) return 'IMAGE'
  if (m in VIDEO_TYPES) return 'VIDEO'
  return null
}

export function extForMime(mime: string): string {
  const m = (mime || '').toLowerCase().split(';')[0].trim()
  return IMAGE_TYPES[m] ?? VIDEO_TYPES[m] ?? ''
}

/** Plain random file name — the backend decides where it physically lives. */
export function randomStorageName(ext: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${ext}`
}

/** Per-file upload cap in bytes for the CURRENT deployment (Infinity = none). */
export function maxUploadBytes(): number {
  if (!onCloudflare()) return Number.POSITIVE_INFINITY
  return r2Binding() ? R2_MAX_BYTES : D1_MAX_BYTES
}

/**
 * Total media each account may hold. 5 GB per user wherever the platform
 * can actually carry it (self-host disk, R2 bucket); a smaller share on the
 * free D1 pool, which caps the whole deployment at ~500 MB.
 */
export function userMediaQuotaBytes(): number {
  if (!onCloudflare()) return FIVE_GB
  return r2Binding() ? FIVE_GB : D1_USER_QUOTA
}

// ─── R2 backend ──────────────────────────────────────────────────

type R2Bucket = {
  put: (key: string, value: ArrayBuffer | Uint8Array | ReadableStream, opts?: unknown) => Promise<unknown>
  get: (key: string, opts?: { range?: { offset: number; length: number } }) => Promise<{
    body: ReadableStream
    size: number
  } | null>
  head: (key: string) => Promise<{ size: number } | null>
  delete: (key: string) => Promise<void>
}

/** Returns the R2 binding, or null when this deployment has none. */
function r2Binding(): R2Bucket | null {
  if (!onCloudflare()) return null
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: { UPLOADS?: R2Bucket } }
    }
    return getCloudflareContext().env.UPLOADS ?? null
  } catch {
    return null
  }
}

function r2(): R2Bucket {
  const bucket = r2Binding()
  if (!bucket) {
    throw new HttpError(500, 'R2 storage is not available on this deployment.')
  }
  return bucket
}

function r2Key(storagePath: string): string {
  const parts = storagePath.split('/')
  const key = parts[parts.length - 1]
  if (!key || key === '.' || key === '..') throw new HttpError(400, 'Invalid storage path.')
  return key
}

// ─── D1 backend (files as chunks inside the database) ────────────

function assertStoragePath(storagePath: string): string {
  const parts = storagePath.split('/')
  const key = parts[parts.length - 1]
  if (!key || key === '.' || key === '..' || key.includes('\\') || key.includes('..')) {
    throw new HttpError(400, 'Invalid storage path.')
  }
  return key
}

function storageWriteError(e: unknown): HttpError {
  const msg = e instanceof Error ? e.message : String(e)
  if (/full|quota|space| diskspace |too many/i.test(msg)) {
    return new HttpError(
      503,
      'Media storage is full on this deployment — the free Cloudflare database holds about 500 MB in total. Remove some old files, or connect an R2 bucket for 10 GB more (CLOUDFLARE.md → "Photos & videos").',
    )
  }
  return new HttpError(503, 'Media storage could not be written on this deployment. Please try again.')
}

function concatChunks(parts: Uint8Array[], total: number): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(total)
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.byteLength
  }
  return out
}

function streamOf(buf: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(buf)
      controller.close()
    },
  })
}

async function d1SaveBuffer(buffer: Uint8Array<ArrayBuffer>, storagePath: string): Promise<void> {
  const key = assertStoragePath(storagePath)
  try {
    for (let seq = 0, offset = 0; offset < buffer.byteLength; seq++, offset += D1_CHUNK_SIZE) {
      const chunk = buffer.subarray(offset, Math.min(offset + D1_CHUNK_SIZE, buffer.byteLength))
      await db.mediaChunk.create({
        data: { storagePath: key, seq, size: chunk.byteLength, data: chunk },
      })
    }
  } catch (e) {
    await db.mediaChunk.deleteMany({ where: { storagePath: key } }).catch(() => {})
    throw storageWriteError(e)
  }
}

// ─── Local backend (lazy fs — never imported on Cloudflare) ──────

type FsPromises = typeof import('fs/promises')

async function localDir(): Promise<string> {
  const dir = env('UPLOAD_DIR')
    ? (env('UPLOAD_DIR') as string)
    : (await import('path')).resolve(process.cwd(), 'uploads')
  const path = await import('path')
  return path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir)
}

async function localPath(storagePath: string): Promise<string> {
  const path = await import('path')
  const dir = await localDir()
  // historical rows may hold an absolute path — keep serving them
  if (path.isAbsolute(storagePath)) {
    const resolved = path.resolve(storagePath)
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
      throw new HttpError(400, 'Invalid storage path.')
    }
    return resolved
  }
  if (storagePath.includes('..') || storagePath.includes('\\')) {
    throw new HttpError(400, 'Invalid storage path.')
  }
  return path.resolve(dir, storagePath)
}

// ─── Public API ──────────────────────────────────────────────────

/** Small files (or callers that already hold a buffer) */
export async function saveBuffer(buffer: Buffer | Uint8Array, storagePath: string): Promise<void> {
  const bytes = new Uint8Array(buffer) // copy into a plain ArrayBuffer-backed view
  if (onCloudflare()) {
    const cap = maxUploadBytes()
    if (bytes.byteLength > cap) {
      throw new HttpError(413, `File is too large for this deployment (limit: ${Math.floor(cap / (1024 * 1024))} MB).`)
    }
    const bucket = r2Binding()
    if (bucket) {
      await bucket.put(r2Key(storagePath), bytes)
      return
    }
    await d1SaveBuffer(bytes, storagePath)
    return
  }
  const fs = (await import('fs/promises')) as FsPromises
  const path = await import('path')
  const target = await localPath(storagePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, bytes)
}

/**
 * Stream any readable source (web ReadableStream from a fetch body, or a
 * Node Readable such as busboy file parts) to storage. On self-host there
 * is no size limit and nothing large is buffered. On Cloudflare the stream
 * is written chunk-by-chunk (D1) or accumulated under the cap (R2, which
 * requires a known length for streamed puts). Returns bytes written.
 */
export async function saveStream(
  stream: Readable | ReadableStream<Uint8Array>,
  storagePath: string,
): Promise<number> {
  // Normalize: we always read a WEB stream; busboy hands us Node streams.
  const web: ReadableStream<Uint8Array> =
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
      ? (stream as ReadableStream<Uint8Array>)
      : (await import('stream')).Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array>

  const cap = maxUploadBytes()
  const reader = web.getReader()

  if (onCloudflare()) {
    const key = assertStoragePath(storagePath)
    const bucket = r2Binding()
    try {
      if (bucket) {
        // R2 wants one put with the whole body — accumulate under the cap.
        const chunks: Uint8Array[] = []
        let bytes = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          if (!value) continue
          bytes += value.byteLength
          if (bytes > cap) throw new HttpError(413, `File is too large for this deployment (limit: ${Math.floor(cap / (1024 * 1024))} MB). Self-hosted Future Voices has no limit.`)
          chunks.push(value)
        }
        if (bytes === 0) return 0
        await bucket.put(r2Key(storagePath), concatChunks(chunks, bytes))
        return bytes
      }
      // D1: write chunk-by-chunk as the bytes arrive — nothing large is buffered.
      let seq = 0
      let pending: Uint8Array[] = []
      let pendingBytes = 0
      let total = 0
      const flush = async () => {
        if (pendingBytes === 0) return
        const chunk = concatChunks(pending, pendingBytes)
        await db.mediaChunk.create({
          data: { storagePath: key, seq, size: chunk.byteLength, data: chunk },
        })
        seq += 1
        pending = []
        pendingBytes = 0
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        total += value.byteLength
        if (total > cap) {
          throw new HttpError(413, `File is too large for this deployment (limit: ${Math.floor(cap / (1024 * 1024))} MB). Self-hosted Future Voices has no limit.`)
        }
        let slice = value
        while (slice.byteLength > 0) {
          const room = D1_CHUNK_SIZE - pendingBytes
          if (slice.byteLength <= room) {
            pending.push(slice)
            pendingBytes += slice.byteLength
            slice = new Uint8Array(0)
          } else {
            pending.push(slice.subarray(0, room))
            pendingBytes += room
            slice = slice.subarray(room)
            await flush()
          }
        }
      }
      await flush()
      return total
    } catch (e) {
      if (e instanceof HttpError) {
        await db.mediaChunk.deleteMany({ where: { storagePath: key } }).catch(() => {})
        throw e
      }
      await db.mediaChunk.deleteMany({ where: { storagePath: key } }).catch(() => {})
      throw storageWriteError(e)
    }
  }

  // Self-host: stream chunk-by-chunk to disk, nothing large is buffered.
  const fsMod = await import('fs')
  const { Readable: ReadableClass } = await import('stream')
  const { pipeline } = await import('stream/promises')
  const path = await import('path')
  const target = await localPath(storagePath)
  const fs = (await import('fs/promises')) as FsPromises
  await fs.mkdir(path.dirname(target), { recursive: true })
  const nodeStream: Readable =
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
      ? ReadableClass.fromWeb(stream as Parameters<typeof ReadableClass.fromWeb>[0])
      : (stream as Readable)
  let bytes = 0
  nodeStream.on('data', (chunk: Buffer) => {
    bytes += chunk.length
  })
  await pipeline(nodeStream, fsMod.createWriteStream(target))
  return bytes
}

export async function fileSize(storagePath: string): Promise<number> {
  if (onCloudflare()) {
    const bucket = r2Binding()
    if (bucket) {
      const obj = await bucket.head(r2Key(storagePath))
      if (!obj) throw new HttpError(404, 'File not found.')
      return obj.size
    }
    const key = assertStoragePath(storagePath)
    const agg = await db.mediaChunk.aggregate({ _sum: { size: true }, where: { storagePath: key } })
    const size = agg._sum.size ?? 0
    if (size === 0) throw new HttpError(404, 'File not found.')
    return size
  }
  const fs = (await import('fs/promises')) as FsPromises
  const target = await localPath(storagePath)
  const info = await fs.stat(target).catch(() => null)
  if (!info) throw new HttpError(404, 'File not found.')
  return info.size
}

/**
 * Byte range read, ALWAYS returned as a web ReadableStream so route
 * handlers can respond identically on both runtimes.
 * `end` is inclusive (matches HTTP byte ranges).
 */
export async function readRange(
  storagePath: string,
  start: number,
  end: number,
): Promise<ReadableStream<Uint8Array>> {
  if (onCloudflare()) {
    const bucket = r2Binding()
    if (bucket) {
      const obj = await bucket.get(r2Key(storagePath), { range: { offset: start, length: end - start + 1 } })
      if (!obj) throw new HttpError(404, 'File not found.')
      return obj.body
    }
    const key = assertStoragePath(storagePath)
    const first = Math.floor(start / D1_CHUNK_SIZE)
    const last = Math.floor(end / D1_CHUNK_SIZE)
    const rows = await db.mediaChunk.findMany({
      where: { storagePath: key, seq: { gte: first, lte: last } },
      orderBy: { seq: 'asc' },
      select: { seq: true, size: true, data: true },
    })
    if (rows.length === 0) throw new HttpError(404, 'File not found.')
    rows.sort((a, b) => a.seq - b.seq)
    const parts: Uint8Array[] = []
    let total = 0
    for (const r of rows) {
      parts.push(new Uint8Array(r.data as Uint8Array))
      total += r.size
    }
    const joined = concatChunks(parts, total)
    const startOffset = start - first * D1_CHUNK_SIZE
    const length = end - start + 1
    return streamOf(joined.subarray(startOffset, startOffset + length))
  }
  const fsMod = await import('fs')
  const { Readable: ReadableClass } = await import('stream')
  const target = await localPath(storagePath)
  const nodeStream = fsMod.createReadStream(target, { start, end })
  return ReadableClass.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

export async function deleteStorageFile(storagePath: string) {
  if (onCloudflare()) {
    const bucket = r2Binding()
    if (bucket) {
      await bucket.delete(r2Key(storagePath)).catch(() => {})
      return
    }
    await db.mediaChunk
      .deleteMany({ where: { storagePath: assertStoragePath(storagePath) } })
      .catch(() => {})
    return
  }
  const fs = (await import('fs/promises')) as FsPromises
  const target = await localPath(storagePath).catch(() => null)
  if (target) await fs.unlink(target).catch(() => {})
}

/** Remove a partially-written file when an upload fails mid-stream. */
export async function discardPartial(storagePath: string) {
  await deleteStorageFile(storagePath)
}

/**
 * Kept for local-path validation compatibility: on Cloudflare it is a no-op
 * (R2/D1 keys are base names), on self-host it enforces the upload directory.
 */
export function assertInsideUploadDir(storagePath: string): string {
  if (onCloudflare()) return storagePath
  // Synchronous callers only use this for validation; resolve with node path.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path') as typeof import('path')
    const dir = env('UPLOAD_DIR') ? path.resolve(env('UPLOAD_DIR') as string) : path.resolve(process.cwd(), 'uploads')
    const resolved = path.isAbsolute(storagePath)
      ? path.resolve(storagePath)
      : path.resolve(dir, storagePath)
    if (resolved !== dir && !resolved.startsWith(dir + path.sep)) {
      throw new HttpError(400, 'Invalid storage path.')
    }
    return resolved
  } catch (e) {
    if (e instanceof HttpError) throw e
    return storagePath
  }
}
