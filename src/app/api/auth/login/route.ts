import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  verifyPassword,
  hashPassword,
  passwordNeedsUpgrade,
  createSession,
  lockDurationMs,
  errorResponse,
  sessionCookieOptions,
  SESSION_COOKIE,
} from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // flood guard BEFORE any expensive scrypt work: 15 attempts / 15 min / IP
    rateLimitByIp(req, 'login', 15, 15 * 60 * 1000)

    const body = await req.json().catch(() => ({}))
    const identifier = String(body.name ?? body.identifier ?? '').trim().toLowerCase()
    const password = String(body.password ?? '')

    if (!identifier || !password) {
      return NextResponse.json({ error: 'Your name and password are required.' }, { status: 400 })
    }

    // A name is the normal sign-in; an email also works for accounts that
    // predate name sign-in (or that were addressed by email as keepers).
    const user =
      (await db.user.findUnique({ where: { name: identifier } })) ??
      (await db.user.findUnique({ where: { email: identifier } }))

    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      const mins = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000)
      return NextResponse.json(
        { error: `Too many failed attempts. This account is locked for another ${mins} minute${mins === 1 ? '' : 's'}.` },
        { status: 429 },
      )
    }

    const passwordOk = user?.passwordHash ? verifyPassword(password, user.passwordHash) : false

    if (!user || !passwordOk || user.banned) {
      if (user && !passwordOk) {
        // escalating lockout: 5 failures → 15 min, doubling up to 24 h
        const failedLogins = user.failedLogins + 1
        const lock = failedLogins >= 5 ? lockDurationMs(failedLogins) : 0
        await db.user.update({
          where: { id: user.id },
          data: {
            failedLogins,
            ...(lock > 0 ? { lockedUntil: new Date(Date.now() + lock) } : {}),
          },
        }).catch(() => {})
      }
      if (user?.banned) {
        return NextResponse.json(
          { error: 'This account has been banned for violating the community standards. If you believe this is a mistake, contact the site administrator.' },
          { status: 403 },
        )
      }
      // one generic answer — the response never reveals which names exist
      return NextResponse.json({ error: 'Incorrect name or password.' }, { status: 401 })
    }

    // Success: reset the failure counter, and transparently upgrade any
    // legacy-format hash to the strongest current parameters.
    const data: { failedLogins: number; lockedUntil: null; passwordHash?: string } = {
      failedLogins: 0,
      lockedUntil: null,
    }
    if (user.passwordHash && passwordNeedsUpgrade(user.passwordHash)) {
      data.passwordHash = hashPassword(password)
    }
    await db.user.update({ where: { id: user.id }, data }).catch(() => {})

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
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
