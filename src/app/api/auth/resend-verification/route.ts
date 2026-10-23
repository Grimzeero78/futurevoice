import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser, generateToken, errorResponse } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(req)
    if (user.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true, message: 'Your email is already verified.' })
    }

    const token = generateToken()
    await db.authToken.create({
      data: {
        token,
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
