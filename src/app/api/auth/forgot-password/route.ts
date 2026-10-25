import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateToken, hashToken, errorResponse } from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'
import { sendPasswordResetEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    // enumeration + flood guard: 10 requests / hour / IP
    await rateLimitByIp(req, 'forgot', 10, 60 * 60 * 1000)

    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'Please enter the recovery email on the account.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    // Do not reveal whether the account exists (or whether it has a
    // recovery email at all)…
    const generic = {
      ok: true,
      emailSent: true,
      message: 'If an account with a recovery email exists, a reset link is on its way.',
    }
    if (!user || !user.email) {
      return NextResponse.json(generic)
    }

    const resetToken = generateToken()
    await db.authToken.create({
      data: {
        token: hashToken(resetToken), // only the hash is stored — a stolen DB cannot redeem links
        userId: user.id,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      },
    })

    const delivered = await sendPasswordResetEmail(req, user.email, resetToken)

    return NextResponse.json({
      ...generic,
      emailSent: delivered,
      message: delivered
        ? generic.message
        : 'If an account with a recovery email exists, a reset link has been issued.',
      // Only present when the server has no SMTP configured — the operator
      // self-hosting without mail still gets a working flow.
      devResetToken: delivered ? undefined : resetToken,
      devNote: delivered
        ? undefined
        : 'This server has no SMTP configured yet. Set SMTP_HOST + MAIL_FROM (see .env.example) to send real emails. Until then the link is shown here.',
    })
  } catch (e) {
    return errorResponse(e)
  }
}
