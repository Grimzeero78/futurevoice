import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  requireUser,
  verifyPassword,
  hashPassword,
  errorResponse,
} from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// Update profile (display name, bio, recovery email)
export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser(req)
    const body = await req.json().catch(() => ({}))

    const data: { displayName?: string; bio?: string | null; email?: string | null; emailVerified?: Date | null } = {}
    if (body.displayName !== undefined) {
      const name = String(body.displayName).trim()
      if (name.length < 2 || name.length > 40) {
        return NextResponse.json({ error: 'Display name must be between 2 and 40 characters.' }, { status: 400 })
      }
      data.displayName = name
    }
    if (body.bio !== undefined) {
      const bio = String(body.bio ?? '').trim()
      if (bio.length > 280) {
        return NextResponse.json({ error: 'Bio must be 280 characters or fewer.' }, { status: 400 })
      }
      data.bio = bio || null
    }
    if (body.email !== undefined) {
      const email = String(body.email ?? '').trim().toLowerCase()
      if (email) {
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          return NextResponse.json({ error: 'That recovery email does not look right.' }, { status: 400 })
        }
        const taken = await db.user.findFirst({ where: { email, id: { not: user.id } } })
        if (taken) {
          return NextResponse.json({ error: 'That email is already registered on another account.' }, { status: 409 })
        }
      }
      data.email = email || null
      // a changed recovery email must be re-verified before it can receive anything
      data.emailVerified = null
    }

    const updated = await db.user.update({ where: { id: user.id }, data })
    return NextResponse.json({
      user: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        displayName: updated.displayName,
        bio: updated.bio,
        role: updated.role,
        emailVerified: updated.emailVerified,
      },
    })
  } catch (e) {
    return errorResponse(e)
  }
}

// Change password (with current password check)
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    // guard against in-session brute force of the current password
    rateLimitByIp(req, 'pwchange', 10, 60 * 60 * 1000)

    const body = await req.json().catch(() => ({}))
    const currentPassword = String(body.currentPassword ?? '')
    const newPassword = String(body.newPassword ?? '')

    if (newPassword.length < 8) {
      return NextResponse.json({ error: 'New password must be at least 8 characters long.' }, { status: 400 })
    }

    const record = await db.user.findUnique({ where: { id: user.id } })
    if (!record || !record.passwordHash) {
      return NextResponse.json({ error: 'This account has no password set yet.' }, { status: 400 })
    }
    if (!verifyPassword(currentPassword, record.passwordHash)) {
      return NextResponse.json({ error: 'Your current password is incorrect.' }, { status: 400 })
    }

    await db.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(newPassword) } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return errorResponse(e)
  }
}
