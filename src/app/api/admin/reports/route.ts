import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireAdmin, errorResponse, HttpError } from '@/lib/auth'
import { registerViolation, banUser } from '@/lib/moderation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Admin: list reports (with capsule + reporter info)
export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req)

    const reports = await db.report.findMany({
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        post: {
          select: {
            id: true,
            title: true,
            hidden: true,
            hiddenReason: true,
            privacy: true,
            status: true,
            content: true,
            author: { select: { displayName: true } },
          },
        },
        reporter: { select: { displayName: true } },
      },
    })

    const open = reports.filter((r) => r.status === 'OPEN').length
    return NextResponse.json({ reports, open })
  } catch (e) {
    return errorResponse(e)
  }
}

// Admin: act on a report — hide/unhide capsule or resolve
export async function PATCH(req: NextRequest) {
  try {
    await requireAdmin(req)
    const body = await req.json().catch(() => ({}))
    const reportId = String(body.reportId ?? '')
    const action = String(body.action ?? '')

    const report = await db.report.findUnique({ where: { id: reportId } })
    if (!report) throw new HttpError(404, 'Report not found.')

    if (action === 'HIDE_POST') {
      await db.$transaction([
        db.post.update({
          where: { id: report.postId },
          data: { hidden: true, hiddenReason: String(body.note ?? 'Hidden by moderators') },
        }),
        db.report.update({ where: { id: reportId }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
      ])
    } else if (action === 'HIDE_AND_STRIKE') {
      // hide the capsule, resolve the report, and record a strike against
      // the author — repeated offenders auto-ban (see moderation.ts)
      const full = await db.post.findUnique({ where: { id: report.postId }, select: { authorId: true } })
      await db.$transaction([
        db.post.update({
          where: { id: report.postId },
          data: { hidden: true, hiddenReason: String(body.note ?? 'Hidden by moderators — standards violation') },
        }),
        db.report.update({ where: { id: reportId }, data: { status: 'RESOLVED', resolvedAt: new Date() } }),
      ])
      let banned = false
      if (full) {
        const strike = await registerViolation(full.authorId, 'confirmed report — standards violation')
        banned = strike.banned
      }
      return NextResponse.json({ ok: true, banned })
    } else if (action === 'BAN_AUTHOR') {
      const full = await db.post.findUnique({ where: { id: report.postId }, select: { authorId: true } })
      if (!full) throw new HttpError(404, 'Capsule not found.')
      await banUser(full.authorId, String(body.note ?? 'Banned after a confirmed community report.'))
      await db.report.update({ where: { id: reportId }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
      return NextResponse.json({ ok: true, banned: true })
    } else if (action === 'UNHIDE_POST') {
      await db.post.update({
        where: { id: report.postId },
        data: { hidden: false, hiddenReason: null },
      })
    } else if (action === 'RESOLVE') {
      await db.report.update({ where: { id: reportId }, data: { status: 'RESOLVED', resolvedAt: new Date() } })
    } else {
      throw new HttpError(400, 'Unknown moderation action.')
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
