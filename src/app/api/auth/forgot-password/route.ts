import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateToken, errorResponse } from '@/lib/auth'
import { sendPasswordResetEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const email = String(body.email ?? '').trim().toLowerCase()
    if (!email) {
      return NextResponse.json({ error: 'Please enter the email you registered with.' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { email } })
    // Do not reveal whether the account exists…
    if (!user) {
      return NextResponse.json({
        ok: true,
        emailSent: true,
        message: 'If an account exists for that email, a reset link is on its way.',
      })
    }

    const resetToken = generateToken()
    await db.authToken.create({
      data: {
        token: resetToken,
        userId: user.id,
        type: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 1000 * 60 * 30), // 30 minutes
      },
    })

    const delivered = await sendPasswordResetEmail(req, email, resetToken)

    return NextResponse.json({
      ok: true,
      emailSent: delivered,
      message: delivered
        ? 'If an account exists for that email, a reset link is on its way.'
        : 'If an account exists for that email, a reset link has been issued.',
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
