import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'
import { env } from '@/lib/env'

export const SESSION_COOKIE = 'fv_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

// ─── Password hashing (scrypt, no external deps) ─────────────────
//
// Hashes are stored in a self-describing format so parameters can be
// strengthened over time without breaking old accounts:
//
//   scrypt$N$r$p$salt$hash     (current format)
//   salt:hash                  (legacy format — N=16384, verified then
//                               transparently re-hashed on sign-in)
//
// Current parameters: N=32768, r=8, p=1, 64-byte key, per-password random
// salt. Offline cracking a stolen database means redoing this work for
// every single row — there are no fast "rainbow table" shortcuts.

const SCRYPT_N = 32768
const SCRYPT_R = 8
const SCRYPT_P = 1
const KEY_LEN = 64
// memory used = 128 * N * r = 32 MiB per hash — raise Node's cap for sync hashing
const SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: SCRYPT_MAXMEM,
  }).toString('hex')
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    if (stored.startsWith('scrypt$')) {
      const [, nStr, rStr, pStr, salt, hash] = stored.split('$')
      if (!nStr || !rStr || !pStr || !salt || !hash) return false
      const candidate = scryptSync(password, salt, KEY_LEN, {
        N: parseInt(nStr, 10), r: parseInt(rStr, 10), p: parseInt(pStr, 10), maxmem: SCRYPT_MAXMEM,
      })
      const expected = Buffer.from(hash, 'hex')
      if (candidate.length !== expected.length) return false
      return timingSafeEqual(candidate, expected)
    }
    // legacy "salt:hash" (original default scrypt parameters)
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const candidate = scryptSync(password, salt, 64)
    const expected = Buffer.from(hash, 'hex')
    if (candidate.length !== expected.length) return false
    return timingSafeEqual(candidate, expected)
  } catch {
    return false
  }
}

/** True when `stored` is not in the strongest current format — caller re-hashes. */
export function passwordNeedsUpgrade(stored: string): boolean {
  return !stored.startsWith(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$`)
}

// ─── Tokens ──────────────────────────────────────────────────────

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

// Session and auth tokens are 256-bit random values. Only their SHA-256
// hash is stored, so a stolen database backup cannot be used to hijack
// live sessions or redeem verification/reset links.
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ─── Brute-force defence ─────────────────────────────────────────

export const LOCK_THRESHOLD = 5        // consecutive failures before lockout
const LOCK_BASE_MS = 15 * 60 * 1000    // 15 minutes
const LOCK_MAX_MS = 24 * 60 * 60 * 1000 // 24 hours

export function lockDurationMs(failedLogins: number): number {
  // 5th failure → 15 min, then 30 min, 1 h, 2 h … capped at 24 h
  const over = Math.max(0, failedLogins - LOCK_THRESHOLD)
  return Math.min(LOCK_BASE_MS * 2 ** over, LOCK_MAX_MS)
}

// ─── Sessions ────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { token: hashToken(token), userId, expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { token: hashToken(token) } })
}

export type SessionUser = {
  id: string
  name: string | null
  email: string | null
  displayName: string
  bio: string | null
  role: string
  emailVerified: Date | null
  createdAt: Date
}

export async function getSessionToken(req: NextRequest): Promise<string | null> {
  return req.cookies.get(SESSION_COOKIE)?.value ?? null
}

export async function getCurrentUser(req: NextRequest): Promise<SessionUser | null> {
  const token = await getSessionToken(req)
  if (!token) return null
  const session = await db.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  })
  if (!session) return null
  if (session.expiresAt < new Date()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => {})
    return null
  }
  // defense-in-depth: a banned account loses its session immediately,
  // even if a ban happened mid-session
  if (session.user.banned) {
    await db.session.deleteMany({ where: { userId: session.user.id } }).catch(() => {})
    return null
  }
  const u = session.user
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    displayName: u.displayName,
    bio: u.bio,
    role: u.role,
    emailVerified: u.emailVerified,
    createdAt: u.createdAt,
  }
}

export async function requireUser(req: NextRequest): Promise<SessionUser> {
  const user = await getCurrentUser(req)
  if (!user) throw new HttpError(401, 'You must be signed in to do that.')
  return user
}

export async function requireAdmin(req: NextRequest): Promise<SessionUser> {
  const user = await requireUser(req)
  if (user.role !== 'ADMIN') throw new HttpError(403, 'Admin access required.')
  return user
}

// ─── Client IP (behind tunnels / reverse proxies) ────────────────

export function clientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local'
}

// ─── HTTP error helper ───────────────────────────────────────────

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) {
    return Response.json({ error: e.message }, { status: e.status })
  }
  console.error('[api] unexpected error:', e)
  return Response.json({ error: 'Something went wrong on our side.' }, { status: 500 })
}

// ─── Cookie serialization (works in route handlers) ─────────────
// `secure` is derived from APP_URL so an https deployment (Cloudflare
// tunnel, nginx TLS, …) gets a secure cookie while plain-http self-hosts
// keep working without a mysterious "can't stay signed in" bug.

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: (env('APP_URL') ?? '').startsWith('https://'),
    path: '/',
    expires: expiresAt,
  }
}
