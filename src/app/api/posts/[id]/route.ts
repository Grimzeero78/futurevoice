import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, getCurrentUser, errorResponse, HttpError, hashPassword } from '@/lib/auth'
import { deleteStorageFile } from '@/lib/storage'
import {
  serializePost,
  parseRecipientTag,
  parseReleaseDate,
  parseMagicKey,
  assertMediaOwnership,
} from '@/lib/fv-core'
import { screenText, registerViolation } from '@/lib/moderation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const postInclude = {
  author: { select: { id: true, displayName: true } },
  media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
  reactions: { select: { type: true, userId: true } },
  _count: { select: { reactions: true } },
} as const

function fmtSealDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

/** A capsule whose release date is still in the future is SEALED — frozen for everyone. */
function sealError(releaseAt: Date, deleting: boolean): HttpError {
  const what = deleting
    ? 'Sealed capsules cannot be deleted — that is the promise of a time capsule. Come back when it opens.'
    : 'Sealed means sealed: nothing on it can be changed until it opens. That is the promise of a time capsule.'
  return new HttpError(403, `This capsule is sealed until ${fmtSealDate(releaseAt)}. ${what}`)
}

// ─── Post detail (with strict access control) ────────────────────
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await getCurrentUser(req)

    const post = await db.post.findUnique({
      where: { id },
      include: postInclude,
    })
    if (!post) return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })

    const isAuthor = !!user && user.id === post.authorId
    const isAdmin = user?.role === 'ADMIN'
    const sealed = post.releaseAt && post.releaseAt > new Date()

    if (!isAuthor) {
      const publiclyVisible =
        post.privacy === 'PUBLIC' && !post.hidden && !(post.status === 'SEALED' || sealed)
      if (!publiclyVisible) {
        if (sealed && post.privacy === 'PUBLIC' && !post.hidden) {
          // teaser: enough to render a "sealed until …" countdown page
          return NextResponse.json({
            sealedOnly: true,
            teaser: {
              id: post.id,
              releaseAt: post.releaseAt,
              recipientTag: post.recipientTag,
              customRecipient: post.customRecipient,
              mediaCount: post.media.length,
            },
          })
        }
        return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })
      }
      // count a view (fire-and-forget)
      db.post
        .update({ where: { id }, data: { views: { increment: 1 } } })
        .catch(() => {})
    }

    const serialized = serializePost(post, { sealedOverride: !!sealed && !isAuthor ? true : undefined })
    if (isAuthor) {
      serialized.heirNote = post.heirNote ?? null
      // magic-key status is the author's business
      serialized.magicKeyHint = post.magicKeyHint
      serialized.magicKeyOpenedAt = post.magicKeyOpenedAt
    }

    const myReaction = user ? post.reactions.find((r) => r.userId === user.id)?.type ?? null : null

    return NextResponse.json({
      post: serialized,
      isAuthor,
      isAdmin,
      myReaction,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// ─── Update capsule metadata (owner only) ────────────────────────
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const existing = await db.post.findUnique({ where: { id }, include: { media: true } })
    if (!existing || existing.authorId !== user.id) {
      return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })
    }
    if (existing.releaseAt && existing.releaseAt > new Date()) {
      throw sealError(existing.releaseAt, false)
    }

    const body = await req.json().catch(() => ({}))
    const data: Record<string, unknown> = {}

    if (body.title !== undefined) {
      const title = String(body.title).trim()
      if (!title || title.length > 120) throw new HttpError(400, 'Title must be 1–120 characters.')
      data.title = title
    }
    if (body.content !== undefined) {
      const content = String(body.content ?? '').trim()
      if (content.length > 20000) throw new HttpError(400, 'Notes are limited to 20,000 characters.')
      data.content = content || null
    }
    if (body.privacy !== undefined) {
      data.privacy = body.privacy === 'PUBLIC' ? 'PUBLIC' : 'PRIVATE'
    }
    if (body.recipientTag !== undefined) {
      data.recipientTag = parseRecipientTag(body.recipientTag)
      if (data.recipientTag === 'CUSTOM') {
        const cr = String(body.customRecipient ?? '').trim()
        if (!cr) throw new HttpError(400, 'Please name the custom recipient.')
        data.customRecipient = cr
      }
    }
    if (body.customRecipient !== undefined && data.recipientTag !== 'CUSTOM') {
      data.customRecipient = String(body.customRecipient ?? '').trim() || null
    }
    if (body.appearInArchive !== undefined) {
      data.appearInArchive = body.appearInArchive !== false
    }
    if (body.releaseAt !== undefined) {
      const releaseAt = parseReleaseDate(body.releaseAt)
      data.releaseAt = releaseAt
      // recompute the lock status against the (possibly new) date
      data.status = releaseAt && releaseAt > new Date() ? 'SEALED' : 'PUBLISHED'
    }
    if (body.mediaIds !== undefined) {
      const mediaIds: string[] = Array.isArray(body.mediaIds) ? body.mediaIds.map(String) : []
      await assertMediaOwnership(mediaIds, user.id)
      data.media = { set: mediaIds.map((mid) => ({ id: mid })) }
    }

    if (body.heirNote !== undefined) {
      const note = String(body.heirNote ?? '').trim() || null
      if (note && note.length > 2000) {
        throw new HttpError(400, 'The note that travels with the capsule is limited to 2,000 characters.')
      }
      data.heirNote = note
    }

    // ── Magic Key management (author only) ──
    if (body.magicKey !== undefined) {
      const mk = String(body.magicKey ?? '').trim()
      if (!mk) {
        // empty string removes the key entirely
        data.magicKeyHash = null
        data.magicKeyLookup = null
        data.magicKeyHint = null
        data.magicKeyOpenedAt = null
      } else {
        const hint = String(body.magicKeyHint ?? '').trim() || null
        if (hint && hint.length > 200) {
          throw new HttpError(400, 'The hint for your magic key is limited to 200 characters.')
        }
        const parsed = parseMagicKey(mk)
        data.magicKeyHash = hashPassword(parsed.normalized)
        data.magicKeyLookup = parsed.lookup
        data.magicKeyHint = hint
      }
    } else if (body.magicKeyHint !== undefined && existing.magicKeyHash) {
      const hint = String(body.magicKeyHint ?? '').trim() || null
      if (hint && hint.length > 200) {
        throw new HttpError(400, 'The hint for your magic key is limited to 200 characters.')
      }
      data.magicKeyHint = hint
    }

    // ── Community standards: screen whatever would be (or stay) public ──
    const nextPrivacy = (data.privacy as string | undefined) ?? existing.privacy
    if (nextPrivacy === 'PUBLIC') {
      const nextTitle = (data.title as string | undefined) ?? existing.title
      const nextContent = (data.content as string | undefined) ?? existing.content
      const nextCustom = (data.customRecipient as string | undefined) ?? existing.customRecipient
      const screen = screenText([nextTitle, nextContent, nextCustom])
      if (screen.flagged) {
        const strike = await registerViolation(user.id, screen.match ?? 'flagged content')
        throw new HttpError(
          422,
          strike.banned
            ? 'Your account has been banned after repeated violations of the community standards.'
            : (screen.reason ?? 'This capsule cannot be published publicly.'),
        )
      }
    }

    const post = await db.post.update({
      where: { id },
      data,
      include: postInclude,
    })

    const serialized = serializePost(post)
    // the author may see the hint and whether the key has been used
    serialized.magicKeyHint = post.magicKeyHint
    serialized.magicKeyOpenedAt = post.magicKeyOpenedAt

    return NextResponse.json({ post: serialized })
  } catch (e) {
    return errorResponse(e)
  }
}

// ─── Delete capsule (owner only) ─────────────────────────────────
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const existing = await db.post.findUnique({ where: { id }, include: { media: true } })
    if (!existing || existing.authorId !== user.id) {
      return NextResponse.json({ error: 'Capsule not found.' }, { status: 404 })
    }
    if (existing.releaseAt && existing.releaseAt > new Date()) {
      throw sealError(existing.releaseAt, true)
    }

    await db.post.delete({ where: { id } })
    for (const m of existing.media) {
      await deleteStorageFile(m.storagePath)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
