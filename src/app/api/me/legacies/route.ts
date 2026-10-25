import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'
import { isSealed } from '@/lib/fv-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Everything that has been entrusted to ME as a keeper/heir.
 * Capsules are matched by the email on my account — the author wrote
 * that email into the capsule when sealing it.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)

    const rows = user.email
      ? await db.heir.findMany({
          where: { email: user.email, post: { hidden: false } },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            email: true,
            name: true,
            claimedAt: true,
            createdAt: true,
            post: {
              select: {
                id: true,
                title: true,
                releaseAt: true,
                status: true,
                recipientTag: true,
                customRecipient: true,
                heirPassHash: true,
                createdAt: true,
                author: { select: { displayName: true } },
                _count: { select: { media: true } },
              },
            },
          },
        })
      : []

    const legacies = rows.map((h) => {
      const sealed = isSealed(h.post)
      return {
        heirId: h.id,
        postId: h.post.id,
        title: h.post.title,
        authorName: h.post.author.displayName,
        releaseAt: h.post.releaseAt,
        sealed,
        recipientTag: h.post.recipientTag,
        customRecipient: h.post.customRecipient,
        mediaCount: h.post._count.media,
        keeperName: h.name,
        entrustedAt: h.createdAt,
        claimedAt: h.claimedAt,
        needsPassphrase: !!h.post.heirPassHash,
      }
    })

    return NextResponse.json({
      legacies,
      counts: {
        total: legacies.length,
        sealed: legacies.filter((l) => l.sealed).length,
        readyToOpen: legacies.filter((l) => !l.sealed && !l.claimedAt).length,
        claimed: legacies.filter((l) => l.claimedAt).length,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}
