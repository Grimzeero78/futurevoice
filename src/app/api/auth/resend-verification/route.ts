import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, generateToken, hashToken, errorResponse } from '@/lib/auth'
import { rateLimitByIp } from '@/lib/rate-limit'
import { sendVerificationEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    rateLimitByIp(req, 'resend-verify', 5, 60 * 60 * 1000)

    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, message: 'Your email is already verified.' })
    }
    if (!user.email) {
      return NextResponse.json(
        { error: 'This account has no recovery email. Add one on the profile page first.' },
        { status: 400 },
      )
    }

    const token = generateToken()
    await db.authToken.create({
      data: {
        token: hashToken(token), // only the hash is stored — a stolen DB cannot redeem links
        userId: user.id,
        type: 'EMAIL_VERIFY',
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 48),
      },
    })

    const delivered = await sendVerificationEmail(req, user.email, token)
    return NextResponse.json({
      ok: true,
      emailSent: delivered,
      message: delivered
        ? `A fresh verification link was sent to ${user.email}.`
        : 'Verification link issued.',
      devVerificationToken: delivered ? undefined : token,
      devNote: delivered
        ? undefined
        : 'This server has no SMTP configured yet. Set SMTP_HOST + MAIL_FROM (see .env.example) to send real emails.',
    })
  } catch (e) {
    return errorResponse(e)
  }
}
