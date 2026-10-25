import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  createSession,
  errorResponse,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'
import { passwordIssue } from '@/lib/password'

export const runtime = 'nodejs'

// Simple, durable sign-up: a NAME and a strong password. No Google, no
// third party, no email — the account lives in this database and keeps
// working for as long as this server does. There is deliberately no
// "forgot password" flow: an inbox is not part of a time capsule.

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s\d.'\-_]{1,39}$/u // 2–40 chars, starts with a letter

export async function POST(req: NextRequest) {
  try {
    // flood guard: 5 sign-ups per hour per IP
    await rateLimitByIp(req, 'register', 5, 60 * 60 * 1000)

    const body = await req.json().catch(() => ({}))
    const rawName = String(body.name ?? '').trim().replace(/\s+/g, ' ')
    const password = String(body.password ?? '')
    const confirm = String(body.confirmPassword ?? password)

    if (!NAME_RE.test(rawName)) {
      return NextResponse.json(
        { error: 'Your name must be 2–40 characters — letters, spaces, numbers, dots, apostrophes and dashes are fine.' },
        { status: 400 },
      )
    }
    const pwProblem = passwordIssue(password)
    if (pwProblem) {
      return NextResponse.json({ error: pwProblem }, { status: 400 })
    }
    if (password !== confirm) {
      return NextResponse.json({ error: 'The two passwords do not match.' }, { status: 400 })
    }
    if (password.toLowerCase() === rawName.toLowerCase()) {
      return NextResponse.json({ error: 'Your password cannot be the same as your name.' }, { status: 400 })
    }

    const name = rawName.toLowerCase() // login names are matched case-insensitively

    const nameTaken = await db.user.findUnique({ where: { name } })
    if (nameTaken) {
      return NextResponse.json({ error: 'That name is already taken — try adding a middle name or a number.' }, { status: 409 })
    }

    // First registered user becomes the platform moderator/admin
    const userCount = await db.user.count()
    const user = await db.user.create({
      data: {
        name,
        passwordHash: hashPassword(password),
        displayName: rawName,
        role: userCount === 0 ? 'ADMIN' : 'USER',
      },
    })

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          displayName: user.displayName,
          role: user.role,
        },
      },
      { status: 201 },
    )
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
