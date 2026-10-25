import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, errorResponse, HttpError } from '@/lib/auth'
import { REPORT_REASONS, isSealed } from '@/lib/fv-core'
import { AUTO_HIDE_REPORTS } from '@/lib/moderation'

export const runtime = 'nodejs'

// Report a public capsule for moderation review
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const user = await requireUser(req)

    const post = await db.post.findUnique({ where: { id } })
    if (!post) throw new HttpError(404, 'Capsule not found.')
    if (post.privacy !== 'PUBLIC' || isSealed(post)) {
      throw new HttpError(403, 'Only public, unsealed capsules can be reported.')
    }
    if (post.authorId === user.id) {
      throw new HttpError(400, 'You can edit or delete your own capsule instead of reporting it.')
    }

    const body = await req.json().catch(() => ({}))
    const reason = String(body.reason ?? '')
    if (!REPORT_REASONS.includes(reason as (typeof REPORT_REASONS)[number])) {
      throw new HttpError(400, 'Please choose a reason for the report.')
    }
    const details = String(body.details ?? '').trim().slice(0, 1000) || null

    // de-duplicate: one open report per (reporter, post)
    const existing = await db.report.findFirst({
      where: { postId: id, reporterId: user.id, status: 'OPEN' },
    })
    if (existing) {
      return NextResponse.json({ ok: true, alreadyReported: true })
    }

    await db.report.create({
      data: { postId: id, reporterId: user.id, reason, details },
    })

    // ── Auto-quarantine: enough distinct community reports hides the
    // capsule from the archive immediately; the admin desk reviews it. ──
    let quarantined = false
    const openReports = await db.report.count({ where: { postId: id, status: 'OPEN' } })
    if (openReports >= AUTO_HIDE_REPORTS() && !post.hidden) {
      await db.post.update({
        where: { id },
        data: {
          hidden: true,
          hiddenReason: `Auto-quarantined: ${openReports} community reports pending review.`,
        },
      })
      quarantined = true
    }

    return NextResponse.json({ ok: true, quarantined }, { status: 201 })
  } catch (e) {
    return errorResponse(e)
  }
}
