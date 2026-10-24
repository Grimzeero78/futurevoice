import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyPassword,
  createSession,
  errorResponse,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      // distinguish a Google-only account from a wrong password below
      const googleOnly = user && !user.passwordHash
      if (googleOnly) {
        return NextResponse.json(
          { error: 'This account was created with Google. Use the "Continue with Google" button to sign in.' },
          { status: 400 },
        )
      }
      return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
    }
    if (user.banned) {
      return NextResponse.json(
        { error: 'This account has been banned for violating the community standards. If you believe this is a mistake, contact the site administrator.' },
        { status: 403 },
      )
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        emailVerified: user.emailVerified,
      },
    })
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
