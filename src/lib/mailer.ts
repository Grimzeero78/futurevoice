import { env } from '@/lib/env'

/**
 * Mail delivery for every runtime, tried in this order:
 *
 *  1. RESEND_API_KEY  — Resend HTTP API (works on Cloudflare Workers)
 *  2. BREVO_API_KEY   — Brevo HTTP API  (works on Cloudflare Workers, 300/day free)
 *  3. SMTP_*          — nodemailer (self-hosted Node; loaded lazily so the
 *                       Workers bundle never pulls in net/tls)
 *  4. nothing set     — mail() logs the intent and returns { delivered: false },
 *                       so a fresh install still works out of the box: the API
 *                       surfaces the action link to the requesting user instead.
 *
 * HTML/text shells are identical whichever provider is active.
 */

export function mailConfigured(): boolean {
  return !!(env('RESEND_API_KEY') || env('BREVO_API_KEY') || (env('SMTP_HOST') && env('MAIL_FROM')))
}

/** Kept for compatibility with older docs/health checks. */
export const smtpConfigured = mailConfigured

export function appUrl(req?: Request): string {
  const configured = env('APP_URL')
  // A value still containing the "<your-subdomain>" placeholder from
  // wrangler.jsonc is not a real URL — fall back to the request origin.
  if (configured && !configured.includes('<')) return configured.replace(/\/$/, '')
  if (req) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'http'
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host')
    if (host) return `${proto}://${host}`
  }
  return 'http://localhost:3000'
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

type Mail = { to: string; subject: string; title: string; bodyHtml: string }

async function sendViaResend(mail: Mail, html: string, text: string): Promise<boolean> {
  const key = env('RESEND_API_KEY')
  if (!key) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env('MAIL_FROM') ?? 'Future Voices <onboarding@resend.dev>',
        to: [mail.to],
        subject: mail.subject,
        html,
        text,
      }),
    })
    if (!res.ok) {
      console.error('[mail] resend failed:', res.status, (await res.text()).slice(0, 300))
      return false
    }
    return true
  } catch (err) {
    console.error('[mail] resend error:', err)
    return false
  }
}

async function sendViaBrevo(mail: Mail, html: string, text: string): Promise<boolean> {
  const key = env('BREVO_API_KEY')
  if (!key) return false
  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: env('MAIL_FROM')
          ? { email: env('MAIL_FROM'), name: 'Future Voices' }
          : { email: 'no-reply@futurevoices.app', name: 'Future Voices' },
        to: [{ email: mail.to }],
        subject: mail.subject,
        htmlContent: html,
        textContent: text,
      }),
    })
    if (!res.ok) {
      console.error('[mail] brevo failed:', res.status, (await res.text()).slice(0, 300))
      return false
    }
    return true
  } catch (err) {
    console.error('[mail] brevo error:', err)
    return false
  }
}

async function sendViaSmtp(mail: Mail, html: string, text: string): Promise<boolean> {
  if (!env('SMTP_HOST') || !env('MAIL_FROM')) return false
  try {
    // lazy import — keeps `net`/`tls` out of the Cloudflare bundle
    const nodemailer = (await import('nodemailer')).default
    const port = parseInt(env('SMTP_PORT') ?? '587', 10)
    const t = nodemailer.createTransport({
      host: env('SMTP_HOST'),
      port,
      secure: env('SMTP_SECURE') ? env('SMTP_SECURE') === 'true' : port === 465,
      auth: env('SMTP_USER') ? { user: env('SMTP_USER'), pass: env('SMTP_PASS') ?? '' } : undefined,
    })
    await t.sendMail({ from: env('MAIL_FROM'), to: mail.to, subject: mail.subject, html, text })
    return true
  } catch (err) {
    console.error('[mail] smtp send failed:', err)
    return false
  }
}

async function send(mail: Mail): Promise<boolean> {
  const html = shell(mail.title, mail.bodyHtml)
  const text = mail.bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (await sendViaResend(mail, html, text)) return true
  if (await sendViaBrevo(mail, html, text)) return true
  if (await sendViaSmtp(mail, html, text)) return true
  console.log(`[mail] no provider configured — would have sent "${mail.subject}" to ${mail.to}`)
  return false
}

export async function sendVerificationEmail(req: Request, to: string, token: string): Promise<boolean> {
  const link = `${appUrl(req)}/?verify=${encodeURIComponent(token)}`
  return send({
    to,
    subject: 'Verify your email — Future Voices',
    title: 'One click, and your voice is on record.',
    bodyHtml: `<p style="font-size:14px;line-height:1.7;">Welcome to Future Voices. Confirm this address so your capsules are unmistakably yours — even decades from now.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Verify my email</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  })
}

export async function sendPasswordResetEmail(req: Request, to: string, token: string): Promise<boolean> {
  const link = `${appUrl(req)}/?reset=${encodeURIComponent(token)}`
  return send({
    to,
    subject: 'Reset your password — Future Voices',
    title: 'A new key for your vault.',
    bodyHtml: `<p style="font-size:14px;line-height:1.7;">Someone (hopefully you) asked to reset the password for this address. The link below works once and expires in one hour.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Choose a new password</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  })
}

/**
 * Sent to a keeper/heir the moment a capsule sealed for them unlocks.
 * The keeper must sign in (or sign up) with this exact email address,
 * then claim the legacy from the "Legacies" tab of their vault.
 */
export async function sendLegacyUnlockedEmail(req: Request | undefined, to: string, authorName: string, title: string): Promise<boolean> {
  const link = `${appUrl(req)}/#/dashboard`
  return send({
    to,
    subject: `A capsule kept for you has opened — Future Voices`,
    title: `${authorName} left something for you, and its time has come.`,
    bodyHtml: `<p style="font-size:14px;line-height:1.7;">A time capsule named <strong>“${title.replace(/</g, '&lt;')}”</strong>, sealed by ${authorName.replace(/</g, '&lt;')}, has just unlocked — and your email address was written inside as one of its keepers.</p>
     <p style="font-size:14px;line-height:1.7;">Sign in to Future Voices with <strong>${to}</strong> to read it. It has been waiting patiently, and it is not going anywhere.</p>
     <p style="margin:22px 0;"><a href="${link}" style="display:inline-block;background:#b45309;color:#fffdfa;text-decoration:none;padding:12px 26px;border-radius:999px;font-weight:bold;">Open the legacies tab</a></p>
     <p style="font-size:13px;color:#78716c;">Or paste this link into your browser:<br><a href="${link}" style="color:#b45309;">${link}</a></p>`,
  })
}
