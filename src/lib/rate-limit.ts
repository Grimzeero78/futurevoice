import { db } from '@/lib/db'
import { HttpError, clientIp } from '@/lib/auth'

// ─── Sliding-window rate limiter (database-backed) ───────────────
// Hits are stored in the RateLimitHit table, so limits survive server
// restarts AND Cloudflare Workers isolate evictions — brute-force
// protection is just as strong on the free Cloudflare deployment as on
// a self-hosted box. Works identically on SQLite (self-host) and D1.

function fmtWait(ms: number): string {
  const s = Math.max(1, Math.ceil(ms / 1000))
  return s > 90 ? `${Math.ceil(s / 60)} minutes` : `${s} seconds`
}

/**
 * Count one hit against `key`. Throws HttpError 429 when the caller has
 * exceeded `limit` hits inside `windowMs`. MUST be awaited.
 */
export async function rateLimit(key: string, limit: number, windowMs: number): Promise<void> {
  const since = new Date(Date.now() - windowMs)
  try {
    const hits = await db.rateLimitHit.count({ where: { key, ts: { gte: since } } })
    if (hits >= limit) {
      // oldest hit still inside the window tells us when a slot frees up
      const oldest = await db.rateLimitHit.findFirst({
        where: { key, ts: { gte: since } },
        orderBy: { ts: 'asc' },
        select: { ts: true },
      })
      const waitMs = oldest ? windowMs - (Date.now() - oldest.ts.getTime()) : windowMs
      throw new HttpError(429, `Too many attempts — try again in ${fmtWait(waitMs)}.`)
    }
    await db.rateLimitHit.create({ data: { key } })
    // opportunistic cleanup: roughly every 20th call, drop this key's stale rows
    if (Math.random() < 0.05) {
      await db.rateLimitHit.deleteMany({ where: { key, ts: { lt: since } } })
    }
  } catch (e) {
    if (e instanceof HttpError) throw e
    // If the limiter table itself is unreachable, fail OPEN but log loudly:
    // availability beats a hard block on a transient DB hiccup, while the
    // per-account lockout in lib/auth still protects logins.
    console.error('[rate-limit] limiter unavailable, failing open:', e)
  }
}

/** Convenience: rate-limit by client IP. */
export async function rateLimitByIp(req: Request, scope: string, limit: number, windowMs: number): Promise<void> {
  await rateLimit(`${scope}:${clientIp(req as never)}`, limit, windowMs)
}
