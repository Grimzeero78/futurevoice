'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Hourglass, MailCheck, KeyRound, MailOpen, Settings } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/fv-client'
import { useFV, type AuthMode, type SessionUser } from '@/lib/fv-store'

// Google "G" mark (inline SVG so no external asset is needed)
function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="mr-2 h-4 w-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.3-2.1 3.7-5.2 3.7-8.6z" />
      <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.8-5.1L1.3 17.2C3.3 21.2 7.3 24 12 24z" />
      <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3L1.3 6.8C.5 8.4 0 10.1 0 12s.5 3.6 1.3 5.2l3.9-2.9z" />
      <path fill="#EA4335" d="M12 4.7c2.3 0 3.8 1 4.7 1.8l3.4-3.3C17.9 1.2 15.2 0 12 0 7.3 0 3.3 2.8 1.3 6.8l3.9 2.9c.9-3 3.6-5 6.8-5z" />
    </svg>
  )
}

type ApiUser = Omit<SessionUser, 'stats'>

export function AuthDialog() {
  const open = useFV((s) => s.authOpen)
  const mode = useFV((s) => s.authMode)
  const resetToken = useFV((s) => s.resetToken)
  const closeAuth = useFV((s) => s.closeAuth)
  const openAuth = useFV((s) => s.openAuth)
  const startPasswordReset = useFV((s) => s.startPasswordReset)
  const refreshSession = useFV((s) => s.refreshSession)
  const navigate = useFV((s) => s.navigate)

  const [busy, setBusy] = useState(false)
  const [registered, setRegistered] = useState<{ email: string; sent: boolean; token?: string; note?: string } | null>(null)
  const [resetInfo, setResetInfo] = useState<{ email: string; sent: boolean; token?: string; note?: string } | null>(null)
  const [googleReady, setGoogleReady] = useState(false)
  const [googleSetupOpen, setGoogleSetupOpen] = useState(false)
  const [googleTried, setGoogleTried] = useState(false)

  useEffect(() => {
    if (open) {
       
      setRegistered(null)
      setResetInfo(null)
      // ask the server once per open whether Google sign-in is configured
      fetch('/api/auth/providers', { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => setGoogleReady(Boolean(d.google)))
        .catch(() => setGoogleReady(false))
       
      setGoogleTried(false)
    }
  }, [open, mode])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const values = Object.fromEntries(fd.entries())
    setBusy(true)
    try {
      if (mode === 'register') {
        const data = await api<{ user: ApiUser; emailSent: boolean; devVerificationToken?: string; devNote?: string }>('/api/auth/register', {
          method: 'POST',
          json: values,
        })
        await refreshSession()
        setRegistered({ email: data.user.email, sent: data.emailSent, token: data.devVerificationToken, note: data.devNote })
        toast({ title: 'Welcome to Future Voices', description: 'Your account is ready.' })
      } else if (mode === 'login') {
        await api('/api/auth/login', { method: 'POST', json: values })
        await refreshSession()
        closeAuth()
        toast({ title: 'Signed in', description: 'The future missed you.' })
      } else if (mode === 'forgot') {
        const data = await api<{ ok: boolean; emailSent: boolean; message: string; devResetToken?: string; devNote?: string }>('/api/auth/forgot-password', {
          method: 'POST',
          json: values,
        })
        setResetInfo({ email: String(values.email), sent: data.emailSent, token: data.devResetToken, note: data.devNote })
      }
    } catch (err) {
      toast({ title: 'That did not work', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  async function verifyNow(token: string) {
    try {
      await api('/api/auth/verify-email', { method: 'POST', json: { token } })
      await refreshSession()
      toast({ title: 'Email verified', description: 'Your voice is fully on record now.' })
      closeAuth()
      navigate({ name: 'compose' })
    } catch (err) {
      toast({ title: 'Verification failed', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    }
  }

  async function doReset(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const values = Object.fromEntries(fd.entries())
    setBusy(true)
    try {
      await api('/api/auth/reset-password', { method: 'POST', json: values })
      toast({ title: 'Password updated', description: 'Sign in with your new password.' })
      setResetInfo(null)
      openAuth('login')
    } catch (err) {
      toast({ title: 'Reset failed', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  // The Google button is ALWAYS shown — when the server has no Google
  // credentials yet, clicking it opens a one-time setup guide instead.
  const googleButton = mode !== 'forgot' && (
    <>
      <a
        href={googleReady ? '/api/auth/google' : undefined}
        onClick={
          googleReady
            ? undefined
            : (e) => {
                e.preventDefault()
                setGoogleSetupOpen(true)
                setGoogleTried(true)
              }
        }
        className="flex h-10 w-full items-center justify-center rounded-md border border-input bg-background text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        role="button"
        aria-label="Continue with Google"
      >
        <GoogleMark /> Continue with Google
      </a>
      {!googleReady && (
        <p className="-mt-1 text-center text-[11px] leading-snug text-muted-foreground">
          Not switched on yet —{' '}
          <button type="button" className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => setGoogleSetupOpen(true)}>
            see how to enable it
          </button>{' '}
          (one-time server setup).
        </p>
      )}
      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-xs uppercase tracking-wide text-muted-foreground">or with email</span>
        <Separator className="flex-1" />
      </div>
    </>
  )

  const titles: Record<AuthMode, [string, string]> = {
    login: ['Welcome back', 'Sign in to open your vault of capsules.'],
    register: ['Claim your voice in the future', 'Create an account to seal your first capsule.'],
    forgot: ['Reset your password', 'Enter your email and we will send a reset link.'],
    reset: ['Choose a new password', 'Your reset link is valid — set a new password below.'],
  }

  const newPasswordForm = (token: string) => (
    <form onSubmit={doReset} className="space-y-4">
      <input type="hidden" name="token" value={token} />
      <div className="space-y-2">
        <Label htmlFor="newPassword">New password</Label>
        <Input id="newPassword" name="newPassword" type="password" required minLength={8} placeholder="At least 8 characters" />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Set new password
      </Button>
      <Button type="button" variant="ghost" className="w-full" onClick={() => openAuth('login')}>
        Back to sign in
      </Button>
    </form>
  )

  const inboxNote = (email: string) => (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3 text-sm">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
        <div>
          <p className="font-medium">Check your inbox</p>
          <p className="mt-1 text-muted-foreground">
            A link was sent to <span className="font-medium text-foreground">{email}</span>. Open it on this device to continue.
          </p>
        </div>
      </div>
      <Button variant="ghost" className="w-full" onClick={() => openAuth('login')}>Back to sign in</Button>
    </div>
  )

  const fallbackTokenNote = (token: string, note?: string, onContinue?: () => void) => (
    <div className="space-y-4">
      <div className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-xs leading-relaxed text-muted-foreground">
        <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
          <MailOpen className="h-3.5 w-3.5" /> Server mail not configured
        </p>
        <p>{note ?? 'This server has no SMTP configured, so the link is shown here instead of being emailed.'}</p>
        <code className="mt-2 block break-all rounded bg-muted px-2 py-1 font-mono text-[10px]">{token}</code>
      </div>
      {onContinue && (
        <Button className="w-full" onClick={onContinue}>Continue</Button>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeAuth()}>
      <DialogContent className="fv-scroll max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Hourglass className="h-6 w-6 text-primary" aria-hidden />
          </div>
          <DialogTitle className="font-display text-center text-xl">{titles[mode][0]}</DialogTitle>
          <DialogDescription className="text-center">{titles[mode][1]}</DialogDescription>
        </DialogHeader>

        {/* ── reset mode: arrived from an email link ── */}
        {mode === 'reset' && resetToken ? (
          newPasswordForm(resetToken)
        ) : mode === 'reset' ? (
          <div className="space-y-4 text-center text-sm text-muted-foreground">
            <p>This reset link is missing its token. Request a fresh one.</p>
            <Button variant="outline" className="w-full" onClick={() => openAuth('forgot')}>Request a new link</Button>
          </div>
        ) : registered ? (
          /* ── post-registration: email verification step ── */
          registered.sent ? (
            inboxNote(registered.email)
          ) : (
            <div className="space-y-4">
              {fallbackTokenNote(registered.token ?? '', registered.note, () => registered.token && verifyNow(registered.token))}
              <Button variant="ghost" className="w-full" onClick={closeAuth}>
                I&apos;ll verify later
              </Button>
            </div>
          )
        ) : resetInfo ? (
          /* ── password reset step ── */
          resetInfo.sent ? (
            inboxNote(resetInfo.email)
          ) : resetInfo.token ? (
            <div className="space-y-4">
              {fallbackTokenNote(resetInfo.token, resetInfo.note, () => startPasswordReset(resetInfo.token!))}
            </div>
          ) : (
            <div className="space-y-4 text-center text-sm text-muted-foreground">
              <p>No account matched that email — check for typos.</p>
              <Button variant="outline" className="w-full" onClick={() => openAuth('forgot')}>Try another email</Button>
            </div>
          )
        ) : (
          /* ── login / register / forgot forms ── */
          <form onSubmit={submit} className="space-y-4">
            {googleButton}
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="displayName">Display name</Label>
                <Input id="displayName" name="displayName" required minLength={2} maxLength={40} placeholder="e.g. Amara of 2026" autoComplete="name" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required placeholder="you@example.com" autoComplete="email" />
            </div>
            {mode !== 'forgot' && (
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password" name="password" type="password" required
                  minLength={mode === 'register' ? 8 : undefined}
                  placeholder={mode === 'register' ? 'At least 8 characters' : 'Your password'}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : mode === 'register' ? 'Create account' : 'Send reset link'}
            </Button>

            <Separator />

            <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
              {mode === 'login' && (
                <>
                  <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('register')}>
                    New here? Create an account
                  </button>
                  <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('forgot')}>
                    Forgot your password?
                  </button>
                </>
              )}
              {mode === 'register' && (
                <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('login')}>
                  Already have an account? Sign in
                </button>
              )}
              {mode === 'forgot' && (
                <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('login')}>
                  Back to sign in
                </button>
              )}
            </div>
          </form>
        )}

        {/* one-time setup guide shown when Google credentials are missing */}
        <SetupGuide
          open={googleSetupOpen}
          onOpenChange={setGoogleSetupOpen}
          onClose={() => setGoogleSetupOpen(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function SetupGuide({ open, onOpenChange, onClose }: { open: boolean; onOpenChange: (o: boolean) => void; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) onClose() }}>
      <DialogContent className="fv-scroll max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2">
            <Settings className="h-5 w-5 text-primary" aria-hidden /> Switch on Google sign-in
          </DialogTitle>
          <DialogDescription>
            One-time setup on the server — about five minutes, free. After step 5 the button starts working for everyone.
          </DialogDescription>
        </DialogHeader>
        <ol className="list-decimal space-y-3 pl-5 text-sm leading-relaxed">
          <li>
            Open <span className="font-medium">console.cloud.google.com</span> → create or select a project.
          </li>
          <li>
            <span className="font-medium">APIs &amp; Services → OAuth consent screen → External</span> — fill in the app name and your email, then save.
          </li>
          <li>
            <span className="font-medium">APIs &amp; Services → Credentials → Create credentials → OAuth client ID → Web application</span>.
          </li>
          <li>
            Under <span className="font-medium">Authorized redirect URIs</span> add exactly:
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">http://localhost:3000/api/auth/google/callback</code>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">https://YOUR-DOMAIN/api/auth/google/callback</code>
          </li>
          <li>
            Copy the Client ID and Client secret into your <span className="font-medium">.env</span> file:
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">GOOGLE_CLIENT_ID=&quot;…apps.googleusercontent.com&quot;</code>
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 font-mono text-[11px]">GOOGLE_CLIENT_SECRET=&quot;GOCSPX-…&quot;</code>
            then restart the server (<span className="font-medium">npm start</span> or <span className="font-medium">docker compose up -d</span>).
          </li>
        </ol>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Until then visitors use the email option — but the Google button above is already visible, so the moment the two
          values are in your .env, Google sign-in simply starts working. Full guide: README → “Google sign-in setup”.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
