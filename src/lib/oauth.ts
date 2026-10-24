import { randomBytes } from 'crypto'

// ─── Google Sign-in (OAuth 2.0 authorization-code flow) ──────────
// Zero dependencies. Enabled automatically when GOOGLE_CLIENT_ID and
// GOOGLE_CLIENT_SECRET are present in the environment.

const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo'

export function googleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
}

function callbackUrl(req: Request): string {
  const base = process.env.APP_URL?.replace(/\/$/, '') ?? new URL(req.url).origin
  return `${base}/api/auth/google/callback`
}

export function buildGoogleAuthUrl(req: Request, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? '',
    redirect_uri: callbackUrl(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // let users switch / pick their account explicitly every time
    prompt: 'select_account',
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

export function newState(): string {
  return randomBytes(16).toString('hex')
}

export type GoogleProfile = {
  sub: string
  email: string
  emailVerified: boolean
  name?: string
}

export async function exchangeCodeForProfile(req: Request, code: string): Promise<GoogleProfile> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      redirect_uri: callbackUrl(req),
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`)
  }
  const tokens = (await res.json()) as { access_token?: string }
  if (!tokens.access_token) throw new Error('Google did not return an access token')

  const infoRes = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  })
  if (!infoRes.ok) {
    throw new Error(`Google userinfo request failed (${infoRes.status})`)
  }
  const info = (await infoRes.json()) as {
    sub: string
    email?: string
    email_verified?: boolean
    name?: string
  }
  if (!info.email) throw new Error('Google account has no email address')

  return {
    sub: info.sub,
    email: info.email.toLowerCase(),
    emailVerified: info.email_verified ?? false,
    name: info.name,
  }
}
