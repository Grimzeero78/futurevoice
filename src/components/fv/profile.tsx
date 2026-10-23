'use client'

import { useState } from 'react'
import { Loader2, BadgeCheck, MailWarning, Download, LogOut, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { toast } from '@/hooks/use-toast'
import { api, initials, formatDate } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

export function Profile() {
  const session = useFV((s) => s.session)
  const refreshSession = useFV((s) => s.refreshSession)
  const setSession = useFV((s) => s.setSession)
  const navigate = useFV((s) => s.navigate)

  const [name, setName] = useState(session?.displayName ?? '')
  const [bio, setBio] = useState(session?.bio ?? '')
  const [savingProfile, setSavingProfile] = useState(false)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [savingPass, setSavingPass] = useState(false)
  const [resending, setResending] = useState(false)

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <User className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Who are you, traveler?</h1>
        <Button className="mt-6" onClick={() => navigate({ name: 'home' })}>Back to home</Button>
      </div>
    )
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault()
    setSavingProfile(true)
    try {
      await api('/api/auth/profile', { method: 'PATCH', json: { displayName: name, bio } })
      await refreshSession()
      toast({ title: 'Profile saved', description: 'The future will know your name.' })
    } catch (err) {
      toast({ title: 'Could not save profile', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSavingProfile(false)
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setSavingPass(true)
    try {
      await api('/api/auth/profile', { method: 'POST', json: { currentPassword: current, newPassword: next } })
      setCurrent('')
      setNext('')
      toast({ title: 'Password changed', description: 'Keep it secret; keep it safe.' })
    } catch (err) {
      toast({ title: 'Could not change password', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setSavingPass(false)
    }
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {})
    setSession(null)
    navigate({ name: 'home' })
    toast({ title: 'Signed out', description: 'The capsules will wait for you.' })
  }

  async function resendVerification() {
    setResending(true)
    try {
      const d = await api<{ emailSent: boolean; devVerificationToken?: string; message?: string }>('/api/auth/resend-verification', { method: 'POST' })
      if (d.emailSent) {
        toast({ title: 'Verification link sent', description: `Check ${session?.email} for the fresh link.` })
      } else if (d.devVerificationToken) {
        // Server has no SMTP — offer to verify immediately.
        await api('/api/auth/verify-email', { method: 'POST', json: { token: d.devVerificationToken } })
        await refreshSession()
        toast({ title: 'Email verified', description: 'Verified directly — this server has no SMTP configured yet.' })
      }
    } catch (err) {
      toast({ title: 'Could not resend', description: err instanceof Error ? err.message : 'Try again.', variant: 'destructive' })
    } finally {
      setResending(false)
    }
  }

  const stats = session.stats ?? { postCount: 0, sealedCount: 0, reactionsReceived: 0 }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center gap-5">
        <Avatar className="h-20 w-20 border-2 border-primary/30">
          <AvatarFallback className="bg-primary/10 font-display text-2xl font-bold text-primary">
            {initials(session.displayName)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="font-display text-3xl font-bold">{session.displayName}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {session.email}
            {session.emailVerified ? (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <BadgeCheck className="h-4 w-4" aria-hidden /> verified
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2 text-amber-600">
                <span className="inline-flex items-center gap-1">
                  <MailWarning className="h-4 w-4" aria-hidden /> email unverified
                </span>
                <Button type="button" size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={resending} onClick={resendVerification}>
                  {resending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                  Resend link
                </Button>
              </span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Keeper of {stats.postCount} capsule{stats.postCount === 1 ? '' : 's'} ({stats.sealedCount} sealed) · {stats.reactionsReceived} signals received · joined {formatDate(session.createdAt)}
          </p>
        </div>
      </header>

      {/* profile form */}
      <section className="rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="profile-form-heading">
        <h2 id="profile-form-heading" className="mb-4 font-semibold">Public profile</h2>
        <form onSubmit={saveProfile} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input id="displayName" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={40} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bio">Bio <span className="text-xs text-muted-foreground">(shown on your public capsules)</span></Label>
            <Textarea id="bio" value={bio ?? ''} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={280} placeholder="A sentence or two about who is speaking to the future…" />
            <p className="text-right text-xs text-muted-foreground">{(bio ?? '').length}/280</p>
          </div>
          <Button type="submit" disabled={savingProfile}>
            {savingProfile && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save profile
          </Button>
        </form>
      </section>

      <Separator className="my-8" />

      {/* password */}
      <section className="rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="password-heading">
        <h2 id="password-heading" className="mb-4 font-semibold">Change password</h2>
        <form onSubmit={changePassword} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current password</Label>
              <Input id="currentPassword" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New password</Label>
              <Input id="newPassword" type="password" value={next} onChange={(e) => setNext(e.target.value)} required minLength={8} autoComplete="new-password" />
            </div>
          </div>
          <Button type="submit" variant="outline" disabled={savingPass}>
            {savingPass && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Update password
          </Button>
        </form>
      </section>

      <Separator className="my-8" />

      {/* data & session */}
      <section className="rounded-xl border bg-card p-6 shadow-sm" aria-labelledby="data-heading">
        <h2 id="data-heading" className="mb-1 font-semibold">Your data, your rules</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Download everything you have ever stored here — profile, capsules, media metadata and reactions — as a portable JSON file.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => window.open('/api/me/export', '_blank')}>
            <Download className="mr-1.5 h-4 w-4" aria-hidden /> Export my data
          </Button>
          <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={signOut}>
            <LogOut className="mr-1.5 h-4 w-4" aria-hidden /> Sign out
          </Button>
        </div>
      </section>
    </div>
  )
}
