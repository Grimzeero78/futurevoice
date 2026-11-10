import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// ─── Delete a comment ────────────────────────────────────────────
// Allowed for: the comment's author, the capsule's author, or an admin.
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; commentId: string }> },
) {
  try {
    const { id, commentId } = await ctx.params
    const user = await requireUser(req)

    const comment = await db.comment.findUnique({
      where: { id: commentId },
      include: { post: { select: { id: true, authorId: true } } },
    })
    if (!comment || comment.post.id !== id) {
      return NextResponse.json({ error: 'Comment not found.' }, { status: 404 })
    }

    const allowed =
      comment.userId === user.id ||
      comment.post.authorId === user.id ||
      user.role === 'ADMIN'
    if (!allowed) {
      return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 })
    }

    await db.comment.delete({ where: { id: commentId } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
