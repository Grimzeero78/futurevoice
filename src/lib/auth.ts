import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'crypto'
import { NextRequest } from 'next/server'
import { db } from '@/lib/db'

export const SESSION_COOKIE = 'fv_session'
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30 // 30 days

// ─── Password hashing (scrypt, no external deps) ─────────────────

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) return false
  return timingSafeEqual(candidate, expected)
}

// ─── Tokens ──────────────────────────────────────────────────────

export function generateToken(): string {
  return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ─── Sessions ────────────────────────────────────────────────────

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({ data: { token, userId, expiresAt } })
  return { token, expiresAt }
}

export async function destroySession(token: string) {
  await db.session.deleteMany({ where: { token } })
}

export type SessionUser = {
  id: string
  email: string
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
    where: { token },
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

export function sessionCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: false,
    path: '/',
    expires: expiresAt,
  }
}
