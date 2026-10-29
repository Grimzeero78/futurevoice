import { db } from '@/lib/db'

/**
 * In-app unlock notifications.
 *
 * When a sealed capsule or diary entry reaches its unlock date, the author
 * gets a notification inside the app (bell in the header). There is no cron
 * service to depend on: the sweep runs (a) on the background scheduler tick,
 * (b) lazily whenever notifications are fetched, and (c) via /api/cron —
 * so the bell is populated the first time the app is opened after the
 * unlock moment. Read-time checks elsewhere still guarantee content can
 * never appear early; this sweep only touches NOTIFICATIONS, never content.
 *
 * Idempotency: rows are guarded by unique (kind, postId)/(kind, entryId)
 * constraints + skipDuplicates, and notifiedAt marks the source row as
 * done — concurrent sweeps cannot double-notify.
 */

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

async function sweepPosts(now: Date): Promise<number> {
  const due = await db.post.findMany({
    where: { notifiedAt: null, releaseAt: { lte: now } },
    select: {
      id: true,
      authorId: true,
      title: true,
      recipientTag: true,
      customRecipient: true,
      releaseAt: true,
      createdAt: true,
    },
  })
  if (due.length === 0) return 0

  // A capsule whose release date was already in the past when it was created
  // went straight to published — no "it opened!" moment to announce.
  const toNotify = due.filter((p) => p.releaseAt && p.createdAt < p.releaseAt)

  if (toNotify.length > 0) {
    await db.notification
      .createMany({
        data: toNotify.map((p) => ({
          userId: p.authorId,
          kind: 'CAPSULE_OPENED',
          title: `“${p.title}” has opened`,
          body: `Your sealed capsule reached its release date (${p.releaseAt ? fmtDate(p.releaseAt) : ''}) and is now readable in your vault.`,
          postId: p.id,
        })),
      })
      .catch(() => {})
  }

  await db.post.updateMany({
    where: { id: { in: due.map((p) => p.id) } },
    data: { notifiedAt: now },
  })
  return toNotify.length
}

async function sweepDiary(now: Date): Promise<number> {
  const due = await db.diaryEntry.findMany({
    where: { notifiedAt: null, sealedUntil: { lte: now } },
    select: {
      id: true,
      authorId: true,
      title: true,
      entryDate: true,
      sealedUntil: true,
      createdAt: true,
    },
  })
  if (due.length === 0) return 0

  const toNotify = due.filter((e) => e.sealedUntil && e.createdAt < e.sealedUntil)

  if (toNotify.length > 0) {
    await db.notification
      .createMany({
        data: toNotify.map((e) => ({
          userId: e.authorId,
          kind: 'DIARY_OPENED',
          title: `Your sealed diary entry “${e.title}” unlocked`,
          body: `The day you wrote down for ${e.entryDate ? fmtDate(e.entryDate) : 'later'} is readable again in your diary.`,
          entryId: e.id,
        })),
      })
      .catch(() => {})
  }

  await db.diaryEntry.updateMany({
    where: { id: { in: due.map((e) => e.id) } },
    data: { notifiedAt: now },
  })
  return toNotify.length
}

/** Issue notifications for every capsule/entry whose seal has lifted. Returns how many were announced. */
export async function sweepUnlocks(): Promise<number> {
  const now = new Date()
  let n = 0
  try {
    n += await sweepPosts(now)
  } catch (e) {
    console.error('[notify] post sweep failed:', e)
  }
  try {
    n += await sweepDiary(now)
  } catch (e) {
    console.error('[notify] diary sweep failed:', e)
  }
  return n
}
