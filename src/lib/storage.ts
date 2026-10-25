import type { Readable } from 'stream'
import { HttpError } from '@/lib/auth'
import { env, onCloudflare } from '@/lib/env'

/**
 * Storage layer — two interchangeable backends behind one API:
 *
 *  - Cloudflare Workers: R2 bucket (binding `UPLOADS`). Objects are stored
 *    under a plain key (the file's base name). Range reads map to R2's
 *    native range queries.
 *  - Self-hosted Node (Windows / Linux / Docker): streamed straight to the
 *    directory behind UPLOAD_DIR (never fully buffered in memory), with
 *    byte-range reads. No practical size limit.
 *
 * Files never live in /public — every byte is served through the
 * access-checked media gateway.
 *
 * DB note: historical self-host rows store an ABSOLUTE path; new rows store
 * a plain file name. The local backend accepts both; the R2 backend uses
 * the base name as the object key.
 */

/** Cloudflare free-tier request bodies cap around 100 MB; stay safely under. */
const R2_MAX_BYTES = 90 * 1024 * 1024

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

function r2(): R2Bucket {
  if (!onCloudflare()) throw new HttpError(500, 'R2 storage is not available on this deployment.')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare') as {
      getCloudflareContext: () => { env: { UPLOADS: R2Bucket } }
    }
    const bucket = getCloudflareContext().env.UPLOADS
    if (!bucket) {
      throw new HttpError(
        503,
        'Media storage is not connected on this deployment yet — photos, videos and audio are switched off. Text capsules, magic keys and the diary work fine. To enable media, see CLOUDFLARE.md → "Photos & videos" (R2).',
      )
    }
    return bucket
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(500, 'Storage is not reachable on this deployment.')
  }
}

function r2Key(storagePath: string): string {
  const parts = storagePath.split('/')
  const key = parts[parts.length - 1]
  if (!key || key === '.' || key === '..') throw new HttpError(400, 'Invalid storage path.')
  return key
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
  if (onCloudflare()) {
    if (buffer.byteLength > R2_MAX_BYTES) throw new HttpError(413, 'File is too large for Cloudflare hosting (90 MB limit).')
    await r2().put(r2Key(storagePath), new Uint8Array(buffer))
    return
  }
  const fs = (await import('fs/promises')) as FsPromises
  const path = await import('path')
  const target = await localPath(storagePath)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, buffer)
}

/**
 * Stream any readable source (web ReadableStream from a fetch body, or a
 * Node Readable such as busboy file parts) to storage with no size limit
 * on self-host. On Cloudflare the stream is accumulated under the 90 MB
 * cap and put to R2 (R2 requires a known length for streamed puts).
 * Returns the number of bytes written.
 */
export async function saveStream(
  stream: Readable | ReadableStream<Uint8Array>,
  storagePath: string,
): Promise<number> {
  // Normalize: R2 path needs a WEB stream; busboy hands us Node streams.
  const web: ReadableStream<Uint8Array> =
    typeof (stream as ReadableStream<Uint8Array>).getReader === 'function'
      ? (stream as ReadableStream<Uint8Array>)
      : (await import('stream')).Readable.toWeb(stream as Readable) as ReadableStream<Uint8Array>
  if (onCloudflare()) {
    const chunks: Uint8Array[] = []
    let bytes = 0
    const reader = web.getReader()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      bytes += value.byteLength
      if (bytes > R2_MAX_BYTES) {
        await reader.cancel().catch(() => {})
        throw new HttpError(413, 'File is too large for Cloudflare hosting (90 MB limit). Self-hosted mode has no limit.')
      }
      chunks.push(value)
    }
    if (bytes === 0) return 0
    const merged = new Uint8Array(bytes)
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.byteLength
    }
    await r2().put(r2Key(storagePath), merged)
    return bytes
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
    const obj = await r2().head(r2Key(storagePath))
    if (!obj) throw new HttpError(404, 'File not found.')
    return obj.size
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
    const obj = await r2().get(r2Key(storagePath), { range: { offset: start, length: end - start + 1 } })
    if (!obj) throw new HttpError(404, 'File not found.')
    return obj.body
  }
  const fsMod = await import('fs')
  const { Readable: ReadableClass } = await import('stream')
  const target = await localPath(storagePath)
  const nodeStream = fsMod.createReadStream(target, { start, end })
  return ReadableClass.toWeb(nodeStream) as ReadableStream<Uint8Array>
}

export async function deleteStorageFile(storagePath: string) {
  if (onCloudflare()) {
    await r2().delete(r2Key(storagePath)).catch(() => {})
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
 * (R2 keys are base names), on self-host it enforces the upload directory.
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
