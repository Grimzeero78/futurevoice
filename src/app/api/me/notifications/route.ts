import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'
import { schedulerTick } from '@/lib/scheduler'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * In-app notifications for the signed-in user.
 *
 * GET /api/me/notifications → latest 30 + unread count
 *
 * The GET also lazily runs the unlock sweep, so a notification is waiting
 * the first time the app is opened after a capsule/entry unlocks.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireUser(req)

    // full tick: unseal due capsules (status flip) + issue unlock notifications
    await schedulerTick()

    const [notifications, unread] = await Promise.all([
      db.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      db.notification.count({ where: { userId: user.id, readAt: null } }),
    ])

    return NextResponse.json({ notifications, unread })
  } catch (e) {
    return errorResponse(e)
  }
}
