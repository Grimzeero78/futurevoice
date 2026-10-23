import { NextRequest, NextResponse } from 'next/server'
import { unlockDuePosts, startScheduler } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Cron endpoint — flips SEALED capsules to PUBLISHED once their release
 * date has arrived. The background scheduler runs this every 60 s, and
 * any external cron (e.g. `curl -X POST .../api/cron?key=…`) can trigger
 * it too. Safe to call repeatedly; it only touches posts whose date has
 * passed.
 *
 * Set CRON_SECRET in .env to require `?key=<CRON_SECRET>` on calls.
 * Without it the endpoint is open but harmless (it can only unseal
 * capsules whose release date has genuinely arrived).
 */
function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.nextUrl.searchParams.get('key') === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Invalid cron key.' }, { status: 401 })
  }
  const unsealed = await unlockDuePosts()
  return NextResponse.json({ ok: true, unsealed, checkedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Invalid cron key.' }, { status: 401 })
  }
  startScheduler()
  const unsealed = await unlockDuePosts()
  return NextResponse.json({ ok: true, unsealed, checkedAt: new Date().toISOString() })
}
