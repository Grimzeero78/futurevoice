import nodemailer from 'nodemailer'

/**
 * Production mailer. Configure with environment variables (see .env.example):
 *
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE, MAIL_FROM, APP_URL
 *
 * When SMTP is not configured, mail() returns { delivered: false } and the
 * API surfaces the action link to the requesting user instead — so a fresh
 * self-hosted install works out of the box, and the moment you add SMTP
 * credentials every email (verification, password reset) is delivered for real.
 */

export function smtpConfigured(): boolean {
  return !!process.env.SMTP_HOST && !!process.env.MAIL_FROM
}

export function appUrl(req?: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
  if (req) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'http'
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (host) return `${proto}://${host}`
  }
  return 'http://localhost:3000'
}

function transport() {
  if (!smtpConfigured()) return null
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10)
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
      : undefined,
  })
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#faf7f2;font-family:Georgia,'Times New Roman',serif;color:#292524;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:14px;overflow:hidden;">
    <div style="background:#b45309;color:#fffdfa;padding:20px 28px;font-size:20px;font-weight:bold;letter-spacing:0.5px;">
      ⧗ Future Voices
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 12px;font-size:19px;color:#292524;">${title}</h2>
      ${bodyHtml}
      <p style="margin-top:26px;font-size:12px;color:#a8a29e;">Sent by your own Future Voices server. If you did not expect this email, you can safely ignore it.</p>
    </div>
  </div>
</body></html>`
}

async function send(to: string, subject: string, title: string, bodyHtml: string): Promise<boolean> {
  const t = transport()
  if (!t) {
    console.log(`[mail] SMTP not configured — would have sent "${subject}" to ${to}`)
    return false
  }
  try {
    await t.sendMail({
      from: process.env.MAIL_FROM,
      to,
      subject,
      html: shell(title, bodyHtml),
      text: bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    })
    return true
  } catch (err) {
    console.error('[mail] send failed:', err)
    return false
  }
}

export async function sendVerificationEmail(req: Request, to: string, token: string): Promise<boolean> {
  const link = `${appUrl(req)}/?verify=${encodeURIComponent(token)}`
  return send(
    to,
    'Verify your email — Future Voices',
    'One click, and your voice is on record.',
    `<p style="font-size:14px;line-height:1.7;">Welcome to Future Voices. Confirm this address so your capsules are unmistakably yours — even decades from now.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Verify my email</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  )
}

export async function sendPasswordResetEmail(req: Request, to: string, token: string): Promise<boolean> {
  const link = `${appUrl(req)}/?reset=${encodeURIComponent(token)}`
  return send(
    to,
    'Reset your password — Future Voices',
    'A new key for your vault.',
    `<p style="font-size:14px;line-height:1.7;">Someone (hopefully you) asked to reset the password for this address. The link below works once and expires in one hour.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Choose a new password</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  )
}

/**
 * Sent to a keeper/heir the moment a capsule sealed for them unlocks.
 * The keeper must sign in (or sign up) with this exact email address,
 * then claim the legacy from the "Legacies" tab of their vault.
 */
export async function sendLegacyUnlockedEmail(req: Request | undefined, to: string, authorName: string, title: string): Promise<boolean> {
  const link = `${appUrl(req)}/#/dashboard`
  return send(
    to,
    `A capsule kept for you has opened — Future Voices`,
    `${authorName} left something for you, and its time has come.`,
    `<p style="font-size:14px;line-height:1.7;">A time capsule named <strong>“${title.replace(/</g, '&lt;')}”</strong>, sealed by ${authorName.replace(/</g, '&lt;')}, has just unlocked — and your email address was written inside as one of its keepers.</p>
     <p style="font-size:14px;line-height:1.7;">Sign in to Future Voices with <strong>${to}</strong> to read it. It has been waiting patiently, and it is not going anywhere.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Open the legacies tab</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  )
}
