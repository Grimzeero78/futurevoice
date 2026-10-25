import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, hashToken, errorResponse } from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // brute-force guard on token guessing: 20 attempts / hour / IP
    rateLimitByIp(req, 'reset', 20, 60 * 60 * 1000)
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    const password = String(body.password ?? '')

    if (!token) return NextResponse.json({ error: 'A reset token is required.' }, { status: 400 })
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    }

    const record = await db.authToken.findUnique({ where: { token: hashToken(token) } })
    if (!record || record.type !== 'PASSWORD_RESET') {
      return NextResponse.json({ error: 'This reset link is invalid.' }, { status: 400 })
    }
    if (record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This reset link has expired. Please request a new one.' }, { status: 400 })
    }

    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null } }),
      db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      // revoke all existing sessions — force re-login everywhere
      db.session.deleteMany({ where: { userId: record.userId } }),
    ])

    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
