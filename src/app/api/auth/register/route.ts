import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword,
  createSession,
  generateToken,
  hashToken,
  errorResponse,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

// Simple, durable sign-up: a NAME and a password. No Google, no third
// party — the account lives in this database and keeps working for as
// long as this server does. An email is optional and used only for
// password recovery and (for keepers) matching a legacy to its heir.

const NAME_RE = /^[\p{L}\p{M}][\p{L}\p{M}\s\d.'\-_]{1,39}$/u // 2–40 chars, starts with a letter

export async function POST(req: NextRequest) {
  try {
    // flood guard: 5 sign-ups per hour per IP
    rateLimitByIp(req, 'register', 5, 60 * 60 * 1000)

    const body = await req.json().catch(() => ({}))
    const rawName = String(body.name ?? '').trim().replace(/\s+/g, ' ')
    const password = String(body.password ?? '')
    const confirm = String(body.confirmPassword ?? password)
    const email = String(body.email ?? '').trim().toLowerCase()

    if (!NAME_RE.test(rawName)) {
      return NextResponse.json(
        { error: 'Your name must be 2–40 characters — letters, spaces, numbers, dots, apostrophes and dashes are fine.' },
        { status: 400 },
      )
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long.' }, { status: 400 })
    }
    if (password !== confirm) {
      return NextResponse.json({ error: 'The two passwords do not match.' }, { status: 400 })
    }
    if (password.toLowerCase() === rawName.toLowerCase()) {
      return NextResponse.json({ error: 'Your password cannot be the same as your name.' }, { status: 400 })
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'That recovery email does not look right.' }, { status: 400 })
    }

    const name = rawName.toLowerCase() // login names are matched case-insensitively

    const [nameTaken, emailTaken] = await Promise.all([
      db.user.findUnique({ where: { name } }),
      email ? db.user.findUnique({ where: { email } }) : Promise.resolve(null),
    ])
    if (nameTaken) {
      return NextResponse.json({ error: 'That name is already taken — try adding a middle name or a number.' }, { status: 409 })
    }
    if (emailTaken) {
      return NextResponse.json({ error: 'That email is already registered on another account.' }, { status: 409 })
    }

    // First registered user becomes the platform moderator/admin
    const userCount = await db.user.count()
    const user = await db.user.create({
      data: {
        name,
        email: email || null,
        passwordHash: hashPassword(password),
        displayName: rawName,
        role: userCount === 0 ? 'ADMIN' : 'USER',
      },
    })

    // Verification mail is only relevant when a recovery email was given.
    let verifyToken: string | undefined
    let delivered = false
    if (email) {
      verifyToken = generateToken()
      await db.authToken.create({
        data: {
          token: hashToken(verifyToken), // only the hash is stored — a stolen DB cannot redeem links
          userId: user.id,
          type: 'EMAIL_VERIFY',
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
        },
      })
      delivered = await sendVerificationEmail(req, email, verifyToken)
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          emailVerified: null,
        },
        emailSent: delivered,
        // Only included when a recovery email was given AND the server has
        // no SMTP configured, so a fresh self-hosted install remains fully
        // usable out of the box.
        devVerificationToken: verifyToken && !delivered ? verifyToken : undefined,
        devNote: verifyToken && !delivered
          ? 'This server has no SMTP configured yet. Set SMTP_HOST + MAIL_FROM (see .env.example) to send real emails. Until then the link is shown here.'
          : undefined,
      },
      { status: 201 },
    )
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    return res
  } catch (e) {
    return errorResponse(e)
  }
}
