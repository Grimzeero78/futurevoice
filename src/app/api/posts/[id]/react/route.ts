import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'
import { REACTION_TYPES, isSealed, ReactionType } from '@/lib/fv-core'

export const runtime = 'nodejs'

/**
 * "Future reactions" — one reaction per user per capsule.
 * POST with { type: 'HEART' } to set/replace, { type: null } to remove.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const post = await db.post.findUnique({ where: { id } })
    if (!post) throw new HttpError(404, 'Capsule not found.')
    if (post.privacy !== 'PUBLIC' || post.hidden || isSealed(post)) {
      throw new HttpError(403, 'Reactions are only open on public, unsealed capsules.')
    }
    if (post.authorId === user.id) {
      throw new HttpError(400, 'You cannot react to your own capsule — but seeing it here means the future is listening.')
    }

    const body = await req.json().catch(() => ({}))
    const type = body.type === null ? null : String(body.type ?? '')

    if (type === null) {
      await db.reaction.deleteMany({ where: { postId: id, userId: user.id } })
      return NextResponse.json({ myReaction: null })
    }

    if (!REACTION_TYPES.includes(type as ReactionType)) {
      throw new HttpError(400, 'Unknown reaction type.')
    }

    await db.reaction.upsert({
      where: { postId_userId: { postId: id, userId: user.id } },
      create: { postId: id, userId: user.id, type },
      update: { type },
    })

    return NextResponse.json({ myReaction: type })
  } catch (e) {
    return errorResponse(e)
  }
}
