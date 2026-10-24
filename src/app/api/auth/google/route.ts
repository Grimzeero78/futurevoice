import { NextRequest, NextResponse } from 'next/server'
import { buildGoogleAuthUrl, googleConfigured, newState } from '@/lib/oauth'

export const runtime = 'nodejs'

// Step 1 of Google sign-in: bounce the visitor to accounts.google.com.
const STATE_COOKIE = 'fv_oauth_state'

export async function GET(req: NextRequest) {
  if (!googleConfigured()) {
    return NextResponse.redirect(new URL('/?authError=google_unconfigured', req.url))
  }

  const state = newState()
  const res = NextResponse.redirect(buildGoogleAuthUrl(req, state))
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production' && new URL(req.url).protocol === 'https:',
    path: '/',
    maxAge: 60 * 10, // 10 minutes to finish the dance
  })
  return res
}
