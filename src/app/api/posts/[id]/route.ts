import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, getCurrentUser, errorResponse, HttpError, hashPassword } from '@/lib/auth'
import { deleteStorageFile } from '@/lib/storage'
import {
  serializePost,
  parseRecipientTag,
  parseReleaseDate,
  parseHeirs,
  normalizeEmail,
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

    // keeper/heir relationship for the signed-in visitor
    const myHeirRow = user?.email
      ? await db.heir.findFirst({ where: { postId: id, email: user.email! } })
      : null
    const heirUnlocked = !!myHeirRow?.claimedAt && !sealed && !post.hidden

    if (!isAuthor && !heirUnlocked) {
      const publiclyVisible =
        post.privacy === 'PUBLIC' && !post.hidden && !(post.status === 'SEALED' || sealed)
      if (!publiclyVisible) {
        if (myHeirRow) {
          // legacy teaser: this capsule is kept for this very account
          return NextResponse.json({
            sealedOnly: true,
            legacyTeaser: {
              id: post.id,
              title: post.title,
              authorName: post.author.displayName,
              releaseAt: post.releaseAt,
              recipientTag: post.recipientTag,
              customRecipient: post.customRecipient,
              mediaCount: post.media.length,
              sealed: !!sealed,
              needsPassphrase: !!post.heirPassHash,
              claimed: !!myHeirRow.claimedAt,
              keeperName: myHeirRow.name,
            },
          })
        }
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

    // the author also receives the keepers list so they can manage it
    const heirRows = isAuthor
      ? await db.heir.findMany({
          where: { postId: id },
          orderBy: { createdAt: 'asc' },
          select: { id: true, email: true, name: true, claimedAt: true, notifiedAt: true },
        })
      : []

    const serialized = serializePost(post, { sealedOverride: !!sealed && !isAuthor && !heirUnlocked ? true : undefined })
    if (isAuthor || heirUnlocked) serialized.heirNote = post.heirNote ?? null
    if (isAuthor) {
      serialized.heirs = heirRows.map((h) => ({
        id: h.id,
        email: h.email,
        name: h.name,
        claimedAt: h.claimedAt,
        notifiedAt: h.notifiedAt,
      }))
      serialized.hasHeirPassphrase = !!post.heirPassHash
      // magic-key status is the author's business
      serialized.magicKeyHint = post.magicKeyHint
      serialized.magicKeyOpenedAt = post.magicKeyOpenedAt
    }
    serialized.viewerIsKeeper = !!myHeirRow

    const myReaction = user ? post.reactions.find((r) => r.userId === user.id)?.type ?? null : null

    return NextResponse.json({
      post: serialized,
      isAuthor,
      isAdmin,
      isKeeper: !!myHeirRow,
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

    // ── Legacy keepers management (author only) ──
    if (body.heirs !== undefined) {
      const heirs = parseHeirs(body.heirs)
      // the author cannot name themselves as their own keeper
      const filtered = heirs.filter((h) => h.email !== normalizeEmail(user.email))
      data.heirs = {
        deleteMany: {},
        create: filtered.map((h) => ({ email: h.email, name: h.name })),
      }
    }
    if (body.heirNote !== undefined) {
      const note = String(body.heirNote ?? '').trim() || null
      if (note && note.length > 2000) {
        throw new HttpError(400, 'The note to your keepers is limited to 2,000 characters.')
      }
      data.heirNote = note
    }
    if (body.heirPassphrase !== undefined) {
      const pass = String(body.heirPassphrase ?? '').trim()
      if (pass.length > 200) {
        throw new HttpError(400, 'The family passphrase is limited to 200 characters.')
      }
      data.heirPassHash = pass ? hashPassword(pass) : null
    } else if (body.clearHeirPassphrase === true) {
      data.heirPassHash = null
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
      include: {
        ...postInclude,
        heirs: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, email: true, name: true, claimedAt: true, notifiedAt: true },
        },
      },
    })

    const serialized = serializePost(post)
    serialized.heirs = post.heirs.map((h) => ({
      id: h.id,
      email: h.email,
      name: h.name,
      claimedAt: h.claimedAt,
      notifiedAt: h.notifiedAt,
    }))
    serialized.hasHeirPassphrase = !!post.heirPassHash
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

    await db.post.delete({ where: { id } })
    for (const m of existing.media) {
      await deleteStorageFile(m.storagePath)
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
