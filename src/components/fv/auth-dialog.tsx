'use client'

import { useEffect, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Hourglass, KeyRound, ShieldCheck } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { api } from '@/lib/fv-client'
import { useFV, type AuthMode, type SessionUser } from '@/lib/fv-store'
import { passwordIssue, passwordStrength, STRENGTH_LABELS, PASSWORD_ADVICE } from '@/lib/password'

type ApiUser = Omit<SessionUser, 'stats'>

function StrengthMeter({ pw }: { pw: string }) {
  const score = passwordStrength(pw)
  const colors = ['bg-destructive/70', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600']
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1.5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              pw && i <= score ? colors[score] : 'bg-muted'
            }`}
          />
        ))}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">
        {pw ? (
          <>
            <span className="font-medium text-foreground">{STRENGTH_LABELS[score]}</span>
            {score < 2 && ' — a longer password protects your vault for decades.'}
          </>
        ) : (
          PASSWORD_ADVICE
        )}
      </p>
    </div>
  )
}

export function AuthDialog() {
  const open = useFV((s) => s.authOpen)
  const mode = useFV((s) => s.authMode)
  const closeAuth = useFV((s) => s.closeAuth)
  const openAuth = useFV((s) => s.openAuth)
  const refreshSession = useFV((s) => s.refreshSession)

  const [busy, setBusy] = useState(false)
  const [pw, setPw] = useState('')
  const [created, setCreated] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setCreated(false)
      setFormError(null)
      setPw('')
    }
  }, [open, mode])

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setFormError(null)
    const fd = new FormData(e.currentTarget)
    const values = Object.fromEntries(fd.entries()) as Record<string, string>

    if (mode === 'register') {
      const issue = passwordIssue(values.password ?? '')
      if (issue) {
        setFormError(issue)
        return
      }
      if (values.password !== (values.confirmPassword ?? '')) {
        setFormError('The two passwords do not match.')
        return
      }
    }

    setBusy(true)
    try {
      if (mode === 'register') {
        await api<{ user: ApiUser }>('/api/auth/register', {
          method: 'POST',
          json: values,
        })
        await refreshSession()
        setCreated(true)
        toast({ title: 'Welcome to Future Voices', description: 'Your account is ready — saved and hashed on this server.' })
      } else {
        await api('/api/auth/login', { method: 'POST', json: values })
        await refreshSession()
        closeAuth()
        toast({ title: 'Signed in', description: 'The future missed you.' })
      }
    } catch (err) {
      toast({ title: 'That did not work', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const titles: Record<AuthMode, [string, string]> = {
    login: ['Welcome back', 'Sign in with your name and password.'],
    register: ['Claim your voice in the future', 'A name and a strong password — that is all an account needs.'],
  }

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

        {created ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-500/5 p-3 text-sm">
              <KeyRound className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
              <div>
                <p className="font-medium">You&apos;re in.</p>
                <p className="mt-1 text-muted-foreground">
                  Your name and password are all you need — they are stored hashed on this server.
                  Write your password down somewhere safe: there is no email reset, by design. Your
                  vault outlives inboxes.
                </p>
              </div>
            </div>
            <Button className="w-full" onClick={closeAuth}>Start writing</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Your name</Label>
              <Input
                id="name" name="name" required
                minLength={2} maxLength={40}
                placeholder={mode === 'register' ? 'e.g. Grace Wanjiku' : 'Your name'}
                autoComplete="username"
              />
              {mode === 'register' && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  This is how you will sign in for the next 100 years — pick a name you will not forget.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password" name="password" type="password" required
                minLength={mode === 'register' ? 8 : undefined}
                placeholder={mode === 'register' ? 'At least 8 characters — letters and numbers' : 'Your password'}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                value={mode === 'register' ? pw : undefined}
                onChange={mode === 'register' ? (e) => setPw(e.target.value) : undefined}
              />
              {mode === 'register' && <StrengthMeter pw={pw} />}
            </div>
            {mode === 'register' && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword" name="confirmPassword" type="password" required
                  minLength={8}
                  placeholder="Type the same password again"
                  autoComplete="new-password"
                  aria-invalid={!!formError}
                />
                {formError && <p className="text-xs text-destructive">{formError}</p>}
              </div>
            )}
            {mode === 'register' && (
              <div className="flex items-start gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                <p>
                  Choose a password you have never used anywhere else. There is no &ldquo;forgot
                  password&rdquo; email here — your words are sealed without inboxes, so your password is
                  the only key.
                </p>
              </div>
            )}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </Button>

            <Separator />

            <div className="flex flex-col gap-1 text-center text-sm text-muted-foreground">
              {mode === 'login' ? (
                <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('register')}>
                  New here? Create an account
                </button>
              ) : (
                <button type="button" className="hover:text-primary underline-offset-2 hover:underline" onClick={() => openAuth('login')}>
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
