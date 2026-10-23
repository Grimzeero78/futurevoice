import { db } from '@/lib/db'

const g = globalThis as unknown as { __fvSchedulerStarted?: boolean }

/**
 * Flips time-locked posts from SEALED to PUBLISHED once their release
 * date has passed. This is the "cron job" — it runs on a background
 * interval, and is additionally invoked lazily by archive queries and
 * via POST /api/cron so an external scheduler can also trigger it.
 * Read-time checks in queries guarantee a post can never be exposed
 * early, even if this job has not fired yet.
 */
export async function unlockDuePosts(): Promise<number> {
  const result = await db.post.updateMany({
    where: { status: 'SEALED', releaseAt: { lte: new Date() } },
    data: { status: 'PUBLISHED' },
  })
  return result.count
}

export function startScheduler() {
  if (g.__fvSchedulerStarted) return
  g.__fvSchedulerStarted = true
  const tick = async () => {
    try {
      const n = await unlockDuePosts()
      if (n > 0) console.log(`[scheduler] unsealed ${n} post(s) whose release date arrived`)
    } catch (e) {
      console.error('[scheduler] tick failed:', e)
    }
  }
  void tick()
  const timer = setInterval(tick, 60_000)
  // don't hold the process open just for the scheduler
  if (typeof timer.unref === 'function') timer.unref()
}
