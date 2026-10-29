import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/me/notifications/read
 * Body: { id: "..." } to mark one as read, or { all: true } for everything.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({} as Record<string, unknown>))

    if (body.all === true) {
      await db.notification.updateMany({
        where: { userId: user.id, readAt: null },
        data: { readAt: new Date() },
      })
      return NextResponse.json({ ok: true })
    }

    const id = String(body.id ?? '')
    if (!id) return NextResponse.json({ error: 'Nothing to mark.' }, { status: 400 })

    await db.notification.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
