import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { errorResponse } from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    if (!token) {
      return NextResponse.json({ error: 'A verification token is required.' }, { status: 400 })
    }

    const record = await db.authToken.findUnique({ where: { token }, include: { user: true } })
    if (!record || record.type !== 'EMAIL_VERIFY') {
      return NextResponse.json({ error: 'This verification link is invalid.' }, { status: 400 })
    }
    if (record.usedAt || record.expiresAt < new Date()) {
      return NextResponse.json({ error: 'This verification link has expired. Please request a new one.' }, { status: 400 })
    }

    await db.$transaction([
      db.user.update({ where: { id: record.userId }, data: { emailVerified: new Date() } }),
      db.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ])

    return NextResponse.json({ ok: true, email: record.user.email })
  } catch (e) {
    return errorResponse(e)
  }
}
