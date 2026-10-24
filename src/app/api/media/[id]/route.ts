import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { db } from '@/lib/db'
import { getCurrentUser, errorResponse } from '@/lib/auth'
import { assertInsideUploadDir, fileSize, openRange, deleteStorageFile } from '@/lib/storage'
import { isSealed } from '@/lib/fv-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Secure media gateway. Files live outside /public, so every byte is
 * served through this handler, which enforces:
 *   - unlinked media  → only the uploader
 *   - private post    → only the author
 *   - sealed post     → only the author (until the release date)
 *   - hidden post     → only the author
 *   - public post     → anyone, once unsealed
 *
 * Responses are STREAMED from disk (never fully buffered), with byte-range
 * support so giant videos seek smoothly and start playing instantly.
 */
function accessDenied(sealedOnly = false) {
  return NextResponse.json(
    sealedOnly ? { error: 'This content is sealed until its release date.' } : { error: 'This content is sealed or private.' },
    { status: 403 },
  )
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser(req)

    const media = await db.media.findUnique({
      where: { id },
      include: {
        post: { select: { authorId: true, privacy: true, status: true, releaseAt: true, hidden: true } },
      },
    })
    if (!media) return NextResponse.json({ error: 'Media not found.' }, { status: 404 })

    const isOwner = !!user && user.id === media.ownerId
    let heirUnlocked = false
    if (media.post && user) {
      const heir = await db.heir.findFirst({
        where: { postId: media.postId ?? '', email: user.email, claimedAt: { not: null } },
        select: { id: true },
      })
      // release DATE is the source of truth for keepers (never early, no sweep-lag)
      const released = !media.post.releaseAt || media.post.releaseAt <= new Date()
      heirUnlocked = !!heir && released && !media.post.hidden
    }
    if (media.post) {
      const postAuthor = media.post.authorId === user?.id
      const publiclyVisible =
        media.post.privacy === 'PUBLIC' && !media.post.hidden && !isSealed(media.post)
      if (!postAuthor && !publiclyVisible && !heirUnlocked) {
        const sealedOnly = media.post.privacy === 'PUBLIC' && !media.post.hidden && isSealed(media.post)
        return accessDenied(sealedOnly)
      }
    } else if (!isOwner) {
      return NextResponse.json({ error: 'This file is not available.' }, { status: 403 })
    }

    const filePath = assertInsideUploadDir(media.storagePath)
    const size = await fileSize(filePath)

    const privateAccess = (isOwner && !media.post) || (!!media.post && !isOwner)
    const baseHeaders = new Headers({
      'Content-Type': media.mimeType,
      'Cache-Control': privateAccess ? 'private, max-age=3600' : 'public, max-age=86400',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': req.nextUrl.searchParams.get('download')
        ? `attachment; filename*=UTF-8''${encodeURIComponent(media.filename)}`
        : 'inline',
    })

    // ── Range requests: stream only the requested slice ──
    const range = req.headers.get('range')
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range)
      if (match) {
        let start = match[1] ? parseInt(match[1], 10) : 0
        let end = match[2] ? parseInt(match[2], 10) : size - 1
        if (match[1] === '' && match[2]) {
          // suffix range: last N bytes
          start = Math.max(0, size - parseInt(match[2], 10))
          end = size - 1
        }
        end = Math.min(end, size - 1)
        if (isNaN(start) || isNaN(end) || start >= size || start > end) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': `bytes */${size}` },
          })
        }
        const nodeStream = openRange(filePath, start, end)
        const headers = new Headers(baseHeaders)
        headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
        headers.set('Content-Length', String(end - start + 1))
        return new NextResponse(Readable.toWeb(nodeStream) as ReadableStream, {
          status: 206,
          headers,
        })
      }
    }

    const headers = new Headers(baseHeaders)
    headers.set('Content-Length', String(size))
    return new NextResponse(Readable.toWeb(openRange(filePath, 0, size - 1)) as ReadableStream, {
      status: 200,
      headers,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function HEAD(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser(req)
    const media = await db.media.findUnique({
      where: { id },
      include: { post: { select: { authorId: true, privacy: true, status: true, releaseAt: true, hidden: true } } },
    })
    if (!media) return new NextResponse(null, { status: 404 })
    const isOwner = !!user && user.id === media.ownerId
    let heirUnlocked = false
    if (media.post && user) {
      const heir = await db.heir.findFirst({
        where: { postId: media.postId ?? '', email: user.email, claimedAt: { not: null } },
        select: { id: true },
      })
      // release DATE is the source of truth for keepers (never early, no sweep-lag)
      const released = !media.post.releaseAt || media.post.releaseAt <= new Date()
      heirUnlocked = !!heir && released && !media.post.hidden
    }
    const publiclyVisible =
      media.post &&
      media.post.privacy === 'PUBLIC' &&
      !media.post.hidden &&
      !isSealed(media.post)
    if (!isOwner && !publiclyVisible && !heirUnlocked) return new NextResponse(null, { status: 403 })

    const filePath = assertInsideUploadDir(media.storagePath)
    const size = await fileSize(filePath)
    return new NextResponse(null, {
      status: 200,
      headers: new Headers({
        'Content-Type': media.mimeType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes',
      }),
    })
  } catch {
    return new NextResponse(null, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser(req)
    if (!user) return NextResponse.json({ error: 'You must be signed in.' }, { status: 401 })

    const media = await db.media.findUnique({ where: { id } })
    if (!media || media.ownerId !== user.id) {
      return NextResponse.json({ error: 'Media not found.' }, { status: 404 })
    }

    await db.media.delete({ where: { id } })
    await deleteStorageFile(media.storagePath)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
