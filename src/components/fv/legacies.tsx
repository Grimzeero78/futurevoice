'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Gift, Lock, MailOpen, KeyRound, Loader2, Hourglass, Users, Sparkles,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from '@/hooks/use-toast'
import { Countdown } from '@/components/fv/countdown'
import { api, formatDate, recipientLabel } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'

export type Legacy = {
  heirId: string
  postId: string
  title: string
  authorName: string
  releaseAt: string | null
  sealed: boolean
  recipientTag: string
  customRecipient: string | null
  mediaCount: number
  keeperName: string | null
  entrustedAt: string
  claimedAt: string | null
  needsPassphrase: boolean
}

type LegaciesData = { legacies: Legacy[]; counts: { total: number; sealed: number; readyToOpen: number; claimed: number } }

export function Legacies() {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const openAuth = useFV((s) => s.openAuth)
  const [data, setData] = useState<LegaciesData | null>(null)
  const [passFor, setPassFor] = useState<Legacy | null>(null)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await api<LegaciesData>('/api/me/legacies')
      setData(d)
    } catch (e) {
      toast({ title: 'Could not load your legacies', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
      setData({ legacies: [], counts: { total: 0, sealed: 0, readyToOpen: 0, claimed: 0 } })
    }
  }, [])

  useEffect(() => {
    if (!session) return
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [session, load])

  if (!session) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <Gift className="mx-auto mb-4 h-10 w-10 text-primary" aria-hidden />
        <h1 className="font-display text-2xl font-bold">Something may be kept for you</h1>
        <p className="mt-2 text-muted-foreground">
          Sign in with the email a loved one wrote into a time capsule, and anything kept for you will appear here.
        </p>
        <Button className="mt-6" onClick={() => openAuth('login')}>Sign in</Button>
      </div>
    )
  }

  async function claim(l: Legacy, pass?: string) {
    setBusy(true)
    try {
      await api(`/api/legacies/${l.postId}/claim`, { method: 'POST', json: pass !== undefined ? { passphrase: pass } : {} })
      toast({ title: 'The capsule is yours', description: 'It has joined your vault of memories.' })
      setPassFor(null)
      setPassphrase('')
      navigate({ name: 'post', id: l.postId })
    } catch (e) {
      toast({ title: 'Could not open the legacy', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  const legacies = data?.legacies ?? []

  return (
    <div>
      {data === null ? (
        <div className="space-y-3" aria-busy="true">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
        </div>
      ) : legacies.length === 0 ? (
        <div className="rounded-xl border border-dashed p-10 text-center">
          <Gift className="mx-auto mb-3 h-9 w-9 text-muted-foreground" aria-hidden />
          <p className="font-display text-lg font-semibold">Nothing is kept for this account — yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            When a parent, grandparent or friend seals a capsule and writes{' '}
            <span className="font-medium text-foreground">{session.displayName}</span> as one of its keepers,
            it will appear here on the day it opens.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {legacies.map((l) => (
            <li key={l.heirId} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate font-display font-semibold">{l.title}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Sealed by <span className="font-medium text-foreground">{l.authorName}</span> · {formatDate(l.entrustedAt)}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant="secondary" className="text-[10px]">{recipientLabel(l.recipientTag, l.customRecipient)}</Badge>
                    {l.keeperName && (
                      <Badge variant="outline" className="gap-1 text-[10px]">
                        <Users className="h-2.5 w-2.5" aria-hidden /> kept for {l.keeperName}
                      </Badge>
                    )}
                    {l.mediaCount > 0 && (
                      <Badge variant="outline" className="text-[10px]">{l.mediaCount} file{l.mediaCount === 1 ? '' : 's'} inside</Badge>
                    )}
                    {l.claimedAt && (
                      <Badge className="gap-1 bg-emerald-600/15 text-emerald-700 text-[10px] dark:text-emerald-400">
                        <MailOpen className="h-2.5 w-2.5" aria-hidden /> claimed {formatDate(l.claimedAt)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  {l.sealed ? (
                    <>
                      <Badge className="gap-1 bg-primary/15 text-primary text-[10px]">
                        <Lock className="h-2.5 w-2.5" aria-hidden /> sealed
                      </Badge>
                      {l.releaseAt && <Countdown target={l.releaseAt} compact />}
                    </>
                  ) : l.claimedAt ? (
                    <Button size="sm" variant="outline" onClick={() => navigate({ name: 'post', id: l.postId })}>
                      <MailOpen className="mr-1.5 h-4 w-4" aria-hidden /> Read again
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => (l.needsPassphrase ? setPassFor(l) : void claim(l))}
                    >
                      <Sparkles className="mr-1.5 h-4 w-4" aria-hidden /> Open legacy
                    </Button>
                  )}
                </div>
              </div>
              {l.sealed && l.releaseAt && (
                <p className="mt-2 text-xs text-muted-foreground">
                  It opens on {formatDate(l.releaseAt, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — we will email you the moment it does.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* family passphrase dialog */}
      <Dialog open={!!passFor} onOpenChange={(o) => !o && setPassFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" aria-hidden /> A family word
            </DialogTitle>
            <DialogDescription>
              {passFor?.authorName} protected “{passFor?.title}” with a passphrase. Type the family word once to open it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="legacy-pass">Family passphrase</Label>
            <Input
              id="legacy-pass"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && passFor && passphrase.trim()) void claim(passFor, passphrase.trim())
              }}
              placeholder="The word only your family knows"
              autoFocus
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPassFor(null)}>Not now</Button>
            <Button disabled={busy || !passphrase.trim()} onClick={() => passFor && void claim(passFor, passphrase.trim())}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Open it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
