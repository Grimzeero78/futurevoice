import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'
import { startScheduler } from '@/lib/scheduler'
import {
  publicPostWhere,
  serializePost,
  parseRecipientTag,
  parseReleaseDate,
  assertMediaOwnership,
} from '@/lib/fv-core'
import type { Prisma } from '@prisma/client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PAGE_SIZE = 12

// ─── Public archive with search & filters ────────────────────────
export async function GET(req: NextRequest) {
  try {
    // lazily boots the background scheduler + sweeps due capsules
    startScheduler()

    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').trim()
    const recipient = sp.get('recipient') ?? ''
    const mediaType = sp.get('mediaType') ?? '' // image | video | text
    const year = sp.get('year') ?? ''
    const sort = sp.get('sort') ?? 'newest'
    const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1)

    const where: Prisma.PostWhereInput = { ...publicPostWhere() }

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { content: { contains: q } },
        { customRecipient: { contains: q } },
      ]
    }
    if (recipient) {
      if (['ALL', 'ANY'].includes(recipient.toUpperCase())) {
        where.recipientTag = { not: 'NONE' }
      } else {
        where.recipientTag = recipient.toUpperCase()
      }
    }
    if (mediaType === 'text') {
      where.media = { none: {} }
    } else if (mediaType === 'image' || mediaType === 'video') {
      where.media = { some: { kind: mediaType === 'image' ? 'IMAGE' : 'VIDEO' } }
    }
    if (/^\d{4}$/.test(year)) {
      const y = parseInt(year, 10)
      where.OR = [
        { releaseAt: { gte: new Date(`${y}-01-01T00:00:00.000Z`), lt: new Date(`${y + 1}-01-01T00:00:00.000Z`) } },
        { AND: [{ releaseAt: null }, { createdAt: { gte: new Date(`${y}-01-01T00:00:00.000Z`), lt: new Date(`${y + 1}-01-01T00:00:00.000Z`) } }] },
      ]
    }

    const orderBy: Prisma.PostOrderByWithRelationInput =
      sort === 'oldest'
        ? { createdAt: 'asc' }
        : sort === 'soonest'
          ? { releaseAt: 'asc' }
          : { createdAt: 'desc' }

    const [posts, total] = await Promise.all([
      db.post.findMany({
        where,
        orderBy,
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          author: { select: { id: true, displayName: true } },
          media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
          reactions: { select: { type: true } },
          _count: { select: { reactions: true } },
        },
      }),
      db.post.count({ where }),
    ])

    return NextResponse.json({
      posts: posts.map((p) => serializePost(p)),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ─── Create a capsule ────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))

    const title = String(body.title ?? '').trim()
    const content = String(body.content ?? '').trim()
    const privacy = body.privacy === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE'
    const recipientTag = parseRecipientTag(body.recipientTag)
    const customRecipient = String(body.customRecipient ?? '').trim() || null
    const appearInArchive = body.appearInArchive !== false
    const releaseAt = parseReleaseDate(body.releaseAt)
    const mediaIds: string[] = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : []

    if (!title || title.length > 120) {
      throw new HttpError(400, 'Please give your capsule a title (up to 120 characters).')
    }
    if (!content && mediaIds.length === 0) {
      throw new HttpError(400, 'A capsule needs a written note or at least one attached file.')
    }
    if (content.length > 20000) {
      throw new HttpError(400, 'Your note is too long — the limit is 20,000 characters.')
    }
    if (recipientTag === 'CUSTOM' && !customRecipient) {
      throw new HttpError(400, 'Please name the custom recipient for this capsule.')
    }
    await assertMediaOwnership(mediaIds, user.id)

    const status = releaseAt && releaseAt > new Date() ? 'SEALED' : 'PUBLISHED'

    const post = await db.post.create({
      data: {
        authorId: user.id,
        title,
        content: content || null,
        privacy,
        status,
        releaseAt,
        recipientTag,
        customRecipient,
        appearInArchive: privacy === 'PUBLIC' ? appearInArchive : true,
        media: { connect: mediaIds.map((id) => ({ id })) },
      },
      include: {
        author: { select: { id: true, displayName: true } },
        media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
        reactions: { select: { type: true } },
        _count: { select: { reactions: true } },
      },
    })

    return NextResponse.json({ post: serializePost(post) }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
