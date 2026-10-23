import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Export the user's own data as a downloadable JSON file:
 * profile, every capsule (including private + sealed metadata),
 * media inventory and reactions received.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)

    const [profile, posts, media, reactions] = await Promise.all([
      db.user.findUnique({
        where: { id: user.id },
        select: { id: true, email: true, displayName: true, bio: true, role: true, createdAt: true, emailVerified: true },
      }),
      db.post.findMany({
        where: { authorId: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true, createdAt: true } },
          reactions: { select: { type: true, user: { select: { displayName: true } }, createdAt: true } },
          _count: { select: { reactions: true } },
        },
      }),
      db.media.findMany({
        where: { ownerId: user.id },
        select: { id: true, kind: true, filename: true, mimeType: true, size: true, postId: true, createdAt: true },
      }),
      db.reaction.findMany({
        where: { post: { authorId: user.id } },
        select: { type: true, createdAt: true, post: { select: { title: true } }, user: { select: { displayName: true } } },
      }),
    ])

    const payload = {
      exportedAt: new Date().toISOString(),
      format: 'future-voices-export/v1',
      note: 'Media files can be downloaded individually at /api/media/{id}?download=1',
      profile,
      capsules: posts,
      mediaLibrary: media,
      reactionsReceived: reactions,
    }

    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="future-voices-export-${stamp}.json"`,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
