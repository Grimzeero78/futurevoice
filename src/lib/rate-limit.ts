import { HttpError, clientIp } from '@/lib/auth'

// ─── In-memory sliding-window rate limiter ───────────────────────
// Protects auth and lookup endpoints from brute force and enumeration.
// Single-instance friendly (self-hosted deployments); costs no schema.

type Bucket = { hits: number[] }

const buckets = new Map<string, Bucket>()

// Opportunistic cleanup so the map cannot grow unbounded
function sweep(now: number) {
  if (buckets.size < 5000) return
  for (const [key, b] of buckets) {
    b.hits = b.hits.filter((t) => now - t < 60 * 60 * 1000)
    if (b.hits.length === 0) buckets.delete(key)
  }
}

/**
 * Count one hit against `key`. Throws HttpError 429 when the caller has
 * exceeded `limit` hits inside `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): void {
  const now = Date.now()
  sweep(now)
  const b = buckets.get(key) ?? { hits: [] }
  b.hits = b.hits.filter((t) => now - t < windowMs)
  if (b.hits.length >= limit) {
    const oldest = b.hits[0] ?? now
    const waitS = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000))
    buckets.set(key, b)
    throw new HttpError(429, `Too many attempts — try again in ${waitS > 90 ? `${Math.ceil(waitS / 60)} minutes` : `${waitS} seconds`}.`)
  }
  b.hits.push(now)
  buckets.set(key, b)
}

/** Convenience: rate-limit by client IP. */
export function rateLimitByIp(req: Request, scope: string, limit: number, windowMs: number): void {
  rateLimit(`${scope}:${clientIp(req as never)}`, limit, windowMs)
}
