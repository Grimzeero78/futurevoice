import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { errorResponse, HttpError, verifyPassword } from '@/lib/auth'
import {
  normalizeMagicKey,
  magicKeyLookup,
  magicGrant,
  MAGIC_KEY_MIN,
  MAGIC_KEY_MAX,
} from '@/lib/fv-core'
import { rateLimitByIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Open a capsule with its Magic Key — no account, no email, nothing.
 *
 * This is the "physical key" the author handed over on paper: the holder
 * types the word on the site and, once the release date has arrived, the
 * message opens right here.
 *
 * Security posture (this endpoint is fully public, so it is hardened):
 *  - the key is normalized (case/whitespace) then HMAC-looked-up — the
 *    database never stores the key itself
 *  - the match is re-verified against the scrypt hash with timingSafeEqual
 *  - a WRONG key reveals absolutely nothing (no hint, no title, no count)
 *  - a sealed match reveals only the open date and the author-chosen hint
 *  - tight per-IP rate limit (8 tries / hour) defeats key brute force
 *  - an unlocked match returns a read-only copy with short-lived signed
 *    media grants (?g=exp.sig) so the files stream through the normal
 *    media gateway without an account
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const normalized = normalizeMagicKey((body as { key?: unknown }).key)
    if (normalized.length < MAGIC_KEY_MIN) {
      throw new HttpError(400, `A magic key has at least ${MAGIC_KEY_MIN} characters.`)
    }
    if (normalized.length > MAGIC_KEY_MAX) {
      throw new HttpError(400, 'That is far too long to be a magic key.')
    }

    // Nobody honestly mistypes a family phrase eight times in an hour.
    await rateLimitByIp(req, 'magic-claim', 8, 60 * 60 * 1000)

    const lookup = magicKeyLookup(normalized)
    const posts = await db.post.findMany({
      where: { magicKeyLookup: lookup, hidden: false },
      include: {
        author: { select: { displayName: true } },
        media: { select: { id: true, kind: true, filename: true, mimeType: true, size: true } },
      },
      take: 5,
    })

    const now = new Date()
    const results: unknown[] = []

    for (const post of posts) {
      // Defense-in-depth: the HMAC index found the row — the scrypt hash
      // confirms the exact key before anything is revealed.
      if (!post.magicKeyHash || !verifyPassword(normalized, post.magicKeyHash)) continue

      const released = !post.releaseAt || post.releaseAt <= now
      if (!released) {
        results.push({
          sealed: true,
          releaseAt: post.releaseAt,
          authorName: post.author.displayName,
          recipientTag: post.recipientTag,
          customRecipient: post.customRecipient,
          // the hint is ONLY ever shown to a correct key on a sealed capsule
          hint: post.magicKeyHint,
          mediaCount: post.media.length,
        })
        continue
      }

      // First open via key — record the moment for the author (fire-and-forget)
      if (!post.magicKeyOpenedAt) {
        db.post
          .update({ where: { id: post.id }, data: { magicKeyOpenedAt: new Date() } })
          .catch(() => {})
      }

      const grant = magicGrant(post.id)
      results.push({
        sealed: false,
        title: post.title,
        content: post.content,
        authorName: post.author.displayName,
        recipientTag: post.recipientTag,
        customRecipient: post.customRecipient,
        heirNote: post.heirNote,
        releaseAt: post.releaseAt,
        createdAt: post.createdAt,
        media: post.media.map((m) => ({ ...m, url: `/api/media/${m.id}?g=${grant}` })),
      })
    }

    return NextResponse.json({ found: results.length > 0, results })
  } catch (e) {
    return errorResponse(e)
  }
}
