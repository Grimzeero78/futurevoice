import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { createSession, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth'
import { exchangeCodeForProfile, googleConfigured } from '@/lib/oauth'

export const runtime = 'nodejs'

const STATE_COOKIE = 'fv_oauth_state'

function fail(req: NextRequest, code: string) {
  return NextResponse.redirect(new URL(`/?authError=${code}`, req.url))
}

// Step 2 of Google sign-in: verify the callback, find or create the
// account, open a session and return the visitor to the app.
export async function GET(req: NextRequest) {
  try {
    if (!googleConfigured()) return fail(req, 'google_unconfigured')

    const url = new URL(req.url)
    if (url.searchParams.get('error')) return fail(req, 'google_cancelled')
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const cookieState = req.cookies.get(STATE_COOKIE)?.value
    if (!code || !state || !cookieState || state !== cookieState) {
      return fail(req, 'google_state')
    }

    const profile = await exchangeCodeForProfile(req, code)

    // find by previous Google link, then by email (account linking)
    let user = await db.user.findUnique({ where: { googleId: profile.sub } })
    if (!user) {
      user = await db.user.findUnique({ where: { email: profile.email } })
    }

    if (user?.banned) return fail(req, 'banned')

    if (user) {
      user = await db.user.update({
        where: { id: user.id },
        data: {
          googleId: profile.sub,
          emailVerified: user.emailVerified ?? (profile.emailVerified ? new Date() : null),
        },
      })
    } else {
      // New account — derive a friendly display name from the Google profile
      const rawName = (profile.name ?? profile.email.split('@')[0] ?? 'Friend of the future').trim()
      const displayName = (rawName.length >= 2 ? rawName : 'Friend of the future').slice(0, 40)
      const userCount = await db.user.count()
      user = await db.user.create({
        data: {
          email: profile.email,
          googleId: profile.sub,
          passwordHash: null,
          displayName,
          role: userCount === 0 ? 'ADMIN' : 'USER',
          emailVerified: profile.emailVerified ? new Date() : null,
        },
      })
    }

    const { token, expiresAt } = await createSession(user.id)
    const res = NextResponse.redirect(new URL('/?authError=google_welcome', req.url))
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(expiresAt))
    res.cookies.delete(STATE_COOKIE)
    return res
  } catch (e) {
    console.error('[auth/google] callback failed:', e)
    return fail(req, 'google_failed')
  }
}
