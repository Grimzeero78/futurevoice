import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, getCurrentUser, errorResponse, HttpError } from '@/lib/auth'
import { isSealed } from '@/lib/fv-core'
import { screenText, registerViolation } from '@/lib/moderation'
import { rateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function serialize(c: {
  id: string
  body: string
  createdAt: Date
  user: { id: string; displayName: string }
}) {
  return {
    id: c.id,
    body: c.body,
    createdAt: c.createdAt,
    userId: c.user.id,
    author: c.user.displayName,
  }
}

// ─── The comment wall — opens when the capsule opens ─────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser(req)

    const post = await db.post.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })

    const isAuthor = !!user && user.id === post.authorId
    const isAdmin = user?.role === 'ADMIN'
    const unlocked = !isSealed(post)

    if (!unlocked || post.hidden) {
      // The room is still closed — do not leak that a conversation will exist.
      return NextResponse.json(
        { error: 'Comments open when the capsule does. Sealed means sealed.' },
        { status: 403 },
      )
    }
    if (post.privacy !== 'PUBLIC' && !isAuthor && !isAdmin) {
      return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })
    }

    const [comments, total] = await Promise.all([
      db.comment.findMany({
        where: { postId: id },
        orderBy: { createdAt: 'asc' }, // Instagram order: oldest at the top
        take: 200,
        include: { user: { select: { id: true, displayName: true } } },
      }),
      db.comment.count({ where: { postId: id } }),
    ])

    return NextResponse.json({
      comments: comments.map(serialize),
      total,
      canComment: !!user,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ─── Add a comment (signed-in, unlocked capsule only) ────────────
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)
    // note: banned accounts already lose their session in getCurrentUser

    const post = await db.post.findUnique({ where: { id } })
    if (!post) return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })

    const isAuthor = user.id === post.authorId
    const isAdmin = user.role === 'ADMIN'
    const unlocked = !isSealed(post)

    if (!unlocked || post.hidden) {
      throw new HttpError(403, 'Comments open when the capsule does. Until the release date, the room stays closed.')
    }
    if (post.privacy !== 'PUBLIC' && !isAuthor && !isAdmin) {
      return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })
    }

    const bodyJson = await req.json().catch(() => ({}))
    const body = String(bodyJson.body ?? '').trim()
    if (!body) throw new HttpError(400, 'Say something first — even an emoji counts.')
    if (body.length > 1000) throw new HttpError(400, 'Comments are limited to 1,000 characters — the future reads fast.')
    if (!isAuthor) {
      // everyone is rate-limited except the capsule's own author
      await rateLimit(`comment:${user.id}`, 8, 60_000)
    }

    // ── Community standards: comments are screened like letters ──
    const screen = screenText([body])
    if (screen.flagged) {
      const strike = await registerViolation(user.id, screen.match ?? 'flagged comment')
      throw new HttpError(
        422,
        strike.banned
          ? 'Your account has been banned after repeated violations of the community standards.'
          : (screen.reason ?? 'That comment cannot be posted.'),
      )
    }

    const created = await db.comment.create({
      data: { postId: id, userId: user.id, body },
      include: { user: { select: { id: true, displayName: true } } },
    })

    const total = await db.comment.count({ where: { postId: id } })
    return NextResponse.json({ comment: serialize(created), total }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
