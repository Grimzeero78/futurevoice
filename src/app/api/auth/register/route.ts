import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  createSession,
  generateToken,
  errorResponse,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'
import { sendVerificationEmail, smtpConfigured } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')
    const displayName = String(body.displayName ?? '').trim()

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    }
    if (displayName.length < 2 || displayName.length > 40) {
      return NextResponse.json({ error: 'Display name must be between 2 and 40 characters.' }, { status: 400 })
    }

    const existing = await db.user.findUnique({ where: { email } })
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }

    // First registered user becomes the platform moderator/admin
    const userCount = await db.user.count()
    const user = await db.user.create({
      data: {
        email,
        passwordHash: hashPassword(password),
        displayName,
        role: userCount === 0 ? 'ADMIN' : 'USER',
      },
    })

    // Send a real verification email via SMTP (falls back gracefully below
    // when the operator has not configured SMTP yet).
    const verifyToken = generateToken()
    await db.authToken.create({
      data: {
        token: verifyToken,
        userId: user.id,
        type: 'EMAIL_VERIFY',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      },
    })
    const delivered = await sendVerificationEmail(req, email, verifyToken)

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json(
      {
        user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role, emailVerified: null },
        emailSent: delivered,
        // Only included when the server has no SMTP configured, so a fresh
        // self-hosted install remains fully usable out of the box.
        devVerificationToken: delivered ? undefined : verifyToken,
        devNote: delivered
          ? undefined
          : 'This server has no SMTP configured yet. Set SMTP_HOST + MAIL_FROM (see .env.example) to send real emails. Until then the link is shown here.',
      },
      { status: 201 },
    )
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
