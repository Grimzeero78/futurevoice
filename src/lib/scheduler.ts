import { db } from '@/lib/db'
import { sweepUnlocks } from '@/lib/notify'

const g = globalThis as unknown as { __fvSchedulerStarted?: boolean }

/**
 * Flips time-locked posts from SEALED to PUBLISHED once their release
 * date has passed. This is pure bookkeeping for counts/badges: every
 * access decision is date-based (see isSealed in fv-core), so a capsule
 * opens the instant its date arrives even if this job never runs —
 * important on Cloudflare Workers, where setInterval timers do not
 * persist between requests. The flip is additionally invoked lazily
 * via POST /api/cron so an external scheduler can also trigger it.
 */
export async function unlockDuePosts(): Promise<number> {
  const now = new Date()
  const result = await db.post.updateMany({
    where: { status: 'SEALED', releaseAt: { lte: now } },
    data: { status: 'PUBLISHED' },
  })
  return result.count
}

/** One scheduler tick: unseal due capsules + issue unlock notifications. */
export async function schedulerTick(): Promise<{ unsealed: number; announced: number }> {
  const unsealed = await unlockDuePosts()
  const announced = await sweepUnlocks()
  return { unsealed, announced }
}

export function startScheduler() {
  if (g.__fvSchedulerStarted) return
  g.__fvSchedulerStarted = true
  const tick = async () => {
    try {
      const { unsealed, announced } = await schedulerTick()
      if (unsealed > 0) console.log(`[scheduler] unsealed ${unsealed} post(s) whose release date arrived`)
      if (announced > 0) console.log(`[scheduler] announced ${announced} unlock notification(s)`)
    } catch (e) {
      console.error('[scheduler] tick failed:', e)
    }
  }
  void tick()
  const timer = setInterval(tick, 60_000)
  // don't hold the process open just for the scheduler
  if (typeof timer.unref === 'function') timer.unref()
}
