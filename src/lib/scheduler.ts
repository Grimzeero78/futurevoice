import { db } from '@/lib/db'
import { sendLegacyUnlockedEmail } from '@/lib/mailer'

const g = globalThis as unknown as { __fvSchedulerStarted?: boolean }

/**
 * Flips time-locked posts from SEALED to PUBLISHED once their release
 * date has passed, then emails the keepers/heirs named inside them.
 * This is the "cron job" — it runs on a background interval, and is
 * additionally invoked lazily by archive queries and via POST /api/cron
 * so an external scheduler can also trigger it. Read-time checks in
 * queries guarantee a post can never be exposed early, even if this
 * job has not fired yet.
 */
export async function unlockDuePosts(): Promise<number> {
  const now = new Date()
  const due = await db.post.findMany({
    where: { status: 'SEALED', releaseAt: { lte: now } },
    select: { id: true },
  })
  if (due.length === 0) return 0

  const result = await db.post.updateMany({
    where: { status: 'SEALED', releaseAt: { lte: now } },
    data: { status: 'PUBLISHED' },
  })

  // Invite the keepers — one attempt per heir (notifiedAt marks it done,
  // so a server without SMTP never spams retries every minute).
  void notifyHeirs(due.map((p) => p.id))
  return result.count
}

async function notifyHeirs(postIds: string[]) {
  try {
    const heirs = await db.heir.findMany({
      where: { postId: { in: postIds }, notifiedAt: null },
      select: { id: true, email: true, post: { select: { title: true, author: { select: { displayName: true } } } } },
    })
    for (const h of heirs) {
      await sendLegacyUnlockedEmail(undefined, h.email, h.post.author.displayName, h.post.title).catch(() => {})
      await db.heir.update({ where: { id: h.id }, data: { notifiedAt: new Date() } }).catch(() => {})
    }
    if (heirs.length > 0) console.log(`[scheduler] notified ${heirs.length} keeper(s) of unlocked capsules`)
  } catch (e) {
    console.error('[scheduler] heir notification failed:', e)
  }
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
