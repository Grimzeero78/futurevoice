import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, errorResponse, HttpError } from '@/lib/auth'
import { banUser, unbanUser } from '@/lib/moderation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin: list members (search by name / email) with capsule + strike info
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)

    const sp = req.nextUrl.searchParams
    const q = (sp.get('q') ?? '').trim()
    const bannedOnly = sp.get('banned') === '1'

    const members = await db.user.findMany({
      where: {
        AND: [
          q
            ? {
                OR: [
                  { displayName: { contains: q } },
                  { email: { contains: q } },
                ],
              }
            : {},
          bannedOnly ? { banned: true } : {},
        ],
      },
      orderBy: [{ banned: 'desc' }, { createdAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        email: true,
        displayName: true,
        role: true,
        banned: true,
        banReason: true,
        bannedAt: true,
        violations: true,
        emailVerified: true,
        createdAt: true,
        _count: { select: { posts: true, reports: true } },
      },
    })

    const bannedCount = await db.user.count({ where: { banned: true } })
    return NextResponse.json({ members, bannedCount })
  } catch (e) {
    return errorResponse(e)
  }
}

// Admin: ban or unban a member (also triggered from the reports desk)
export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const userId = String(body.userId ?? '')
    const action = String(body.action ?? '')
    const note = String(body.note ?? '').trim()

    if (!userId) throw new HttpError(400, 'Which member? (userId required)')
    if (userId === admin.id) throw new HttpError(400, 'You cannot ban your own admin account.')

    const target = await db.user.findUnique({ where: { id: userId } })
    if (!target) throw new HttpError(404, 'Member not found.')

    if (action === 'BAN') {
      const reason = note || 'Violating the Future Voices community standards.'
      await banUser(userId, reason)
      return NextResponse.json({ ok: true, banned: true, reason })
    } else if (action === 'UNBAN') {
      await unbanUser(userId)
      return NextResponse.json({ ok: true, banned: false })
    } else {
      throw new HttpError(400, 'Unknown action — use BAN or UNBAN.')
    }
  } catch (e) {
    return errorResponse(e)
  }
}
