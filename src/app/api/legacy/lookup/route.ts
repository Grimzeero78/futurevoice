import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { errorResponse, HttpError } from '@/lib/auth'
import { isSealed } from '@/lib/fv-core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Public legacy lookup — "Has something been left for me?"
 *
 * Anyone can type an email address (any provider — Gmail, Yahoo, Outlook,
 * school mail…) and learn whether a capsule was sealed with them as a
 * keeper. Discovery is the whole point: a grandfather's heirs may not use
 * Gmail, and the family may lose the email. What they learn is limited to
 * the author's name, the open date and the seal state — never the contents.
 * Title and media stay private until the claim day.
 *
 * Rate-limited in memory per IP to stop brute-force email enumeration.
 */

const hits = new Map<string, { n: number; reset: number }>()
const LIMIT = 30
const WINDOW_MS = 60 * 60 * 1000

function rateLimit(ip: string) {
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || rec.reset < now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS })
    return
  }
  if (rec.n >= LIMIT) {
    throw new HttpError(429, 'Too many checks from this connection — please try again in a little while.')
  }
  rec.n += 1
  // opportunistic cleanup so the map cannot grow unbounded
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (v.reset < now) hits.delete(k)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new HttpError(400, 'Please enter a valid email address.')
    }

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
    rateLimit(ip)

    const rows = await db.heir.findMany({
      where: { email, post: { hidden: false } },
      select: {
        id: true,
        claimedAt: true,
        post: {
          select: {
            status: true,
            releaseAt: true,
            author: { select: { displayName: true } },
          },
        },
      },
      take: 20,
    })

    return NextResponse.json({
      found: rows.length > 0,
      capsules: rows.map((h) => ({
        authorName: h.post.author.displayName,
        releaseAt: h.post.releaseAt,
        sealed: isSealed(h.post),
        claimed: !!h.claimedAt,
      })),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
