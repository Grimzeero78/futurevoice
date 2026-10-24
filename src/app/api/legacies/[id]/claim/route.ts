import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError, verifyPassword } from '@/lib/auth'
import { serializePost } from '@/lib/fv-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * A keeper claims the capsule kept for them.
 *
 * Rules:
 *  - you must hold a keeper (heir) spot for this capsule, matched by email
 *  - the capsule must have reached its release date
 *  - if the author set a family passphrase, it must be supplied once
 * After claiming, the capsule is permanently readable for this account
 * (post detail + media gateway both honour the claim).
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const heirRow = await db.heir.findFirst({
      where: { postId: id, email: user.email },
      include: {
        post: {
          include: {
            author: { select: { id: true, displayName: true } },
            media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
            reactions: { select: { type: true } },
            _count: { select: { reactions: true } },
          },
        },
      },
    })

    if (!heirRow || heirRow.post.hidden) {
      throw new HttpError(404, 'No capsule is kept for this account at that address.')
    }
    const post = heirRow.post

    // The release DATE is the source of truth — a keeper never waits for
    // the minute-sweep to flip the status flag before they can claim.
    const released = !post.releaseAt || post.releaseAt <= new Date()
    if (!released) {
      throw new HttpError(
        403,
        `This capsule is still sealed — it opens ${post.releaseAt!.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.`,
      )
    }

    if (!heirRow.claimedAt) {
      if (post.heirPassHash) {
        const body = await req.json().catch(() => ({} as Record<string, unknown>))
        const passphrase = String((body as { passphrase?: unknown }).passphrase ?? '')
        if (!passphrase) {
          throw new HttpError(400, 'This legacy is protected by a family passphrase — ask the author for the word.')
        }
        if (!verifyPassword(passphrase, post.heirPassHash)) {
          throw new HttpError(403, 'That passphrase does not match. Try again, or ask the author for the family word.')
        }
      }
      await db.heir.update({
        where: { id: heirRow.id },
        data: {
          claimedAt: new Date(),
          claimedByUserId: user.id,
          // they are here in person — no need for the unlock email anymore
          ...(heirRow.notifiedAt ? {} : { notifiedAt: new Date() }),
        },
      })
    }

    const serialized = serializePost(post)
    serialized.heirNote = post.heirNote ?? null
    serialized.viewerIsKeeper = true

    return NextResponse.json({
      claimed: true,
      alreadyClaimed: !!heirRow.claimedAt,
      post: serialized,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
