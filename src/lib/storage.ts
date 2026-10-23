import { mkdir, writeFile, unlink, stat } from 'fs/promises'
import { createWriteStream, createReadStream } from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { HttpError } from '@/lib/auth'

/**
 * Storage layer.
 *
 * - No file-size cap: uploads are streamed straight to disk (never fully
 *   buffered in memory), and downloads are streamed back out with Range
 *   support. The only practical limit is the disk behind UPLOAD_DIR
 *   (or the reverse proxy body limit if the host adds one).
 * - Files live OUTSIDE /public and are only served through the
 *   access-checked media gateway.
 */

export const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads')

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

export function randomStorageName(ext: string): string {
  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${ext}`
  return path.join(UPLOAD_DIR, name)
}

export function assertInsideUploadDir(storagePath: string) {
  const resolved = path.resolve(storagePath)
  if (resolved !== UPLOAD_DIR && !resolved.startsWith(UPLOAD_DIR + path.sep)) {
    throw new HttpError(400, 'Invalid storage path.')
  }
  return resolved
}

/** Small files (or callers that already hold a buffer) */
export async function saveBuffer(buffer: Buffer, storagePath: string): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(storagePath, buffer)
}

/**
 * Stream any web ReadableStream (e.g. a busboy file stream or the raw
 * request body) to a file on disk with no size limit.
 * Returns the number of bytes written.
 */
export async function saveStream(
  stream: Readable | ReadableStream<Uint8Array>,
  storagePath: string,
): Promise<number> {
  await mkdir(UPLOAD_DIR, { recursive: true })
  const nodeStream =
    stream instanceof Readable ? stream : Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0])
  let bytes = 0
  nodeStream.on('data', (chunk: Buffer) => {
    bytes += chunk.length
  })
  await pipeline(nodeStream, createWriteStream(storagePath))
  return bytes
}

export async function fileSize(storagePath: string): Promise<number> {
  const info = await stat(storagePath).catch(() => null)
  if (!info) throw new HttpError(404, 'File not found.')
  return info.size
}

export function openRange(storagePath: string, start: number, end: number) {
  return createReadStream(storagePath, { start, end })
}

export async function deleteStorageFile(storagePath: string) {
  const resolved = assertInsideUploadDir(storagePath)
  await unlink(resolved).catch(() => {})
}

/** Remove a partially-written file when an upload fails mid-stream. */
export async function discardPartial(storagePath: string) {
  await unlink(storagePath).catch(() => {})
}
