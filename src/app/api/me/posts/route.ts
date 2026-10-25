import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'
import { isSealed, serializePost } from '@/lib/fv-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Dashboard: every capsule owned by the current user, with stats
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)

    const posts = await db.post.findMany({
      where: { authorId: user.id },
      orderBy: { createdAt: 'desc' },
      include: {
        media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
        reactions: { select: { type: true } },
        _count: { select: { reactions: true } },
      },
    })

    const now = new Date()
    const serialized = posts.map((p) => ({
      ...serializePost(p, { sealedOverride: isSealed(p) }),
      reportCount: 0,
      // the author sees their own magic-key status
      magicKeyHint: p.magicKeyHint,
      magicKeyOpenedAt: p.magicKeyOpenedAt,
    }))

    const summary = {
      total: serialized.length,
      public: serialized.filter((p) => p.privacy === 'PUBLIC').length,
      private: serialized.filter((p) => p.privacy === 'PRIVATE').length,
      sealed: serialized.filter((p) => p.status === 'SEALED').length,
      totalViews: serialized.reduce((acc, p) => acc + p.views, 0),
      totalReactions: serialized.reduce((acc, p) => acc + p.reactionTotal, 0),
      dueForRelease: posts.filter(
        (p) => p.status === 'SEALED' && p.releaseAt && p.releaseAt <= now,
      ).length,
    }

    return NextResponse.json({ posts: serialized, summary })
  } catch (e) {
    return errorResponse(e)
  }
}
