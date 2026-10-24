'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  Eye, Flag, Pencil, Trash2, Globe, EyeOff, Lock, Unlock, Hourglass, CalendarDays, Loader2,
  AlertTriangle, MailOpen, Gift, KeyRound,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog'
import { toast } from '@/hooks/use-toast'
import { Countdown } from '@/components/fv/countdown'
import { api, recipientLabel, formatDate, REACTION_META, REPORT_REASONS, initials } from '@/lib/fv-client'
import { useFV } from '@/lib/fv-store'
import type { SerializedPost } from '@/lib/fv-core'

type DetailData = {
  post: SerializedPost
  isAuthor: boolean
  isAdmin: boolean
  isKeeper?: boolean
  myReaction: string | null
}

type Teaser = {
  sealedOnly: true
  teaser?: { id: string; releaseAt: string | null; recipientTag: string; customRecipient: string | null; mediaCount: number }
  legacyTeaser?: {
    id: string
    title: string
    authorName: string
    releaseAt: string | null
    recipientTag: string
    customRecipient: string | null
    mediaCount: number
    sealed: boolean
    needsPassphrase: boolean
    claimed: boolean
    keeperName: string | null
  }
}

export function PostDetail({ id }: { id: string }) {
  const session = useFV((s) => s.session)
  const navigate = useFV((s) => s.navigate)
  const openAuth = useFV((s) => s.openAuth)

  const [data, setData] = useState<DetailData | null>(null)
  const [teaser, setTeaser] = useState<Teaser | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reacting, setReacting] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const d = await api<DetailData | Teaser>(`/api/posts/${id}`)
      if ('sealedOnly' in d && d.sealedOnly) {
        setTeaser(d)
        setData(null)
      } else {
        setData(d as DetailData)
        setTeaser(null)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capsule not found.')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load, session])

  async function react(type: string | null) {
    if (!session) {
      openAuth('login')
      return
    }
    if (!data) return
    setReacting(true)
    const prev = data.myReaction
    const next = prev === type ? null : type
    // optimistic
    setData({ ...data, myReaction: next })
    try {
      await api(`/api/posts/${id}/react`, { method: 'POST', json: { type: next } })
      await load()
    } catch (e) {
      setData({ ...data, myReaction: prev })
      toast({ title: 'Reaction failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setReacting(false)
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16" aria-busy="true">
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
        <div className="mt-6 h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="mt-4 h-40 animate-pulse rounded bg-muted" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-muted-foreground" aria-hidden />
        <h1 className="font-display text-2xl font-bold">{error}</h1>
        <Button variant="outline" className="mt-6" onClick={() => navigate({ name: 'archive' })}>
          Back to the archive
        </Button>
      </div>
    )
  }

  /* ─── Legacy teaser: this capsule is kept for the signed-in account ─── */
  if (teaser?.legacyTeaser) {
    const lt = teaser.legacyTeaser
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="sealed-stripes rounded-2xl border-2 border-primary/40 bg-card p-10 text-center shadow-lg">
          <span className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-primary/25 ring-pulse" aria-hidden />
            <span className="wax-seal flex h-16 w-16 items-center justify-center rounded-full">
              <Gift className="h-8 w-8 text-primary-foreground" aria-hidden />
            </span>
          </span>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">A capsule is kept for you</p>
          <h1 className="mt-2 font-display text-2xl font-bold">“{lt.title}”</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Sealed by <span className="font-medium text-foreground">{lt.authorName}</span>
            {lt.keeperName ? <> for <span className="font-medium text-foreground">{lt.keeperName}</span></> : null}
            . {lt.sealed
              ? 'It is still waiting for its moment — the countdown below is already running.'
              : lt.claimed
                ? 'It has been sealed again by its author. Come back when the seal breaks.'
                : 'Its time has come — open it from the Legacies tab of your vault.'}
          </p>
          {lt.sealed && lt.releaseAt && (
            <div className="mt-8">
              <Countdown target={lt.releaseAt} />
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <Badge variant="secondary">{recipientLabel(lt.recipientTag, lt.customRecipient)}</Badge>
            {lt.needsPassphrase && !lt.claimed && (
              <Badge variant="outline" className="gap-1">
                <KeyRound className="h-3 w-3" aria-hidden /> protected by a family passphrase
              </Badge>
            )}
          </div>
          {!lt.sealed && (
            <Button className="mt-8" onClick={() => navigate({ name: 'dashboard' })}>
              <Gift className="mr-1.5 h-4 w-4" aria-hidden /> Go to my legacies
            </Button>
          )}
        </div>
      </div>
    )
  }

  /* ─── Sealed teaser view ─── */
  if (teaser?.teaser) {
    const t = teaser.teaser
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <div className="sealed-stripes rounded-2xl border-2 border-dashed border-primary/40 bg-card p-10 text-center shadow-lg">
          <span className="relative mx-auto mb-6 flex h-20 w-20 items-center justify-center">
            <span className="absolute h-20 w-20 rounded-full bg-primary/25 ring-pulse" aria-hidden />
            <span className="wax-seal flex h-16 w-16 items-center justify-center rounded-full">
              <Lock className="h-8 w-8 text-primary-foreground" aria-hidden />
            </span>
          </span>
          <p className="text-sm font-medium uppercase tracking-widest text-primary">This capsule is sealed</p>
          <h1 className="mt-2 font-display text-2xl font-bold">Its words are waiting for {t.releaseAt ? formatDate(t.releaseAt, { year: 'numeric' }) : 'the right moment'}</h1>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            {t.mediaCount > 0
              ? `${t.mediaCount} file${t.mediaCount === 1 ? '' : 's'} sleep inside. `
              : ''}
            Come back when the seal breaks — the countdown is already running.
          </p>
          {t.releaseAt && (
            <div className="mt-8">
              <Countdown target={t.releaseAt} />
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
            <Badge variant="secondary">{recipientLabel(t.recipientTag, t.customRecipient)}</Badge>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null
  const { post, isAuthor } = data
  const isKeeper = !!data.isKeeper && !isAuthor
  const sealed = post.status === 'SEALED'
  const canReact = session && !sealed && post.privacy === 'PUBLIC' && !isAuthor

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <Hourglass className="h-3 w-3" aria-hidden /> {recipientLabel(post.recipientTag, post.customRecipient)}
            </Badge>
            <Badge variant={post.privacy === 'PUBLIC' ? 'outline' : 'secondary'} className="gap-1">
              {post.privacy === 'PUBLIC' ? <Globe className="h-3 w-3" aria-hidden /> : <EyeOff className="h-3 w-3" aria-hidden />}
              {post.privacy === 'PUBLIC' ? (post.appearInArchive ? 'Public · listed' : 'Public · unlisted') : 'Private'}
            </Badge>
            {sealed && (
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <Lock className="h-3 w-3" aria-hidden /> Sealed
              </Badge>
            )}
            {post.hidden && (
              <Badge variant="destructive" className="gap-1">Hidden by moderators</Badge>
            )}
            {isKeeper && (
              <Badge className="gap-1 bg-primary text-primary-foreground">
                <Gift className="h-3 w-3" aria-hidden /> Legacy · kept for you
              </Badge>
            )}
          </div>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-4xl">{post.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                {initials(post.author?.displayName ?? '?')}
              </span>
              {post.author?.displayName ?? 'Unknown'}
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden /> {formatDate(post.createdAt)}
            </span>
            {!sealed && (
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" aria-hidden /> {post.views} view{post.views === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>

        {isAuthor && (
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate({ name: 'edit', id: post.id })}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle className="font-display">Delete this capsule forever?</AlertDialogTitle>
                  <AlertDialogDescription>This cannot be undone — the future will never read it.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep it</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={async () => {
                      try {
                        await api(`/api/posts/${id}`, { method: 'DELETE' })
                        toast({ title: 'Capsule deleted' })
                        navigate({ name: 'dashboard' })
                      } catch (e) {
                        toast({ title: 'Delete failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
                      }
                    }}
                  >
                    Delete forever
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </div>

      {/* countdown strip */}
      {sealed && post.releaseAt && (
        <div className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <Countdown target={post.releaseAt} />
          {isAuthor && (
            <p className="mt-3 text-xs text-muted-foreground">
              You are the author — you can preview the contents below. Everyone else sees only the seal.
            </p>
          )}
        </div>
      )}

      {/* keeper's note from the author */}
      {isKeeper && post.heirNote && !sealed && (
        <div className="paper-grain mb-6 rounded-xl border border-primary/30 bg-primary/5 p-5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-widest text-primary">
            <Gift className="h-3.5 w-3.5" aria-hidden /> A note from the one who sealed this
          </p>
          <p className="whitespace-pre-wrap font-display text-[15px] leading-relaxed">{post.heirNote}</p>
        </div>
      )}

      {/* media */}
      {post.media.length > 0 && (
        <section className="mb-6 space-y-3" aria-label="Attached media">
          {post.media.map((m) =>
            m.kind === 'IMAGE' ? (
              <figure key={m.id} className="overflow-hidden rounded-xl border shadow-sm">
                <img src={m.url} alt={m.filename} className="max-h-[560px] w-full object-contain bg-secondary/50" loading="lazy" />
              </figure>
            ) : (
              <figure key={m.id} className="overflow-hidden rounded-xl border bg-black shadow-sm">
                <video src={m.url} controls preload="metadata" className="max-h-[560px] w-full" />
              </figure>
            ),
          )}
        </section>
      )}

      {/* letter */}
      {post.content && (
        <section className="paper-grain rounded-xl border bg-card p-6 shadow-sm sm:p-8" aria-label="The letter">
          <p className="whitespace-pre-wrap font-display text-[17px] leading-relaxed">{post.content}</p>
        </section>
      )}

      <Separator className="my-8" />

      {/* reactions */}
      <section aria-label="Reactions">
        <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-semibold">
          <MailOpen className="h-4 w-4 text-primary" aria-hidden />
          Leave a signal for the future
        </h2>
        {canReact ? (
          <div className="flex flex-wrap gap-2">
            {REACTION_META.map((r) => {
              const active = data.myReaction === r.type
              const count = post.reactionCounts[r.type] ?? 0
              return (
                <button
                  key={r.type}
                  disabled={reacting}
                  onClick={() => void react(r.type)}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm transition-all disabled:opacity-60 ${
                    active
                      ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                      : 'bg-card hover:border-primary/50 hover:bg-primary/5'
                  }`}
                >
                  <span aria-hidden>{r.type === 'HEART' ? '❤️' : r.type === 'STAR' ? '🌟' : r.type === 'CLOCK' ? '🕰️' : '✨'}</span>
                  {r.label}
                  {count > 0 && <span className={`tabular-nums ${active ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{count}</span>}
                </button>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {isAuthor
              ? `${post.reactionTotal} signal${post.reactionTotal === 1 ? '' : 's'} received so far.`
              : sealed
                ? 'Reactions open when the capsule does.'
                : 'Sign in to leave a signal for the future.'}
          </p>
        )}
      </section>

      {/* report */}
      {!isAuthor && post.privacy === 'PUBLIC' && !sealed && (
        <div className="mt-10 flex justify-end">
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => (session ? setReportOpen(true) : openAuth('login'))}>
            <Flag className="mr-1.5 h-3.5 w-3.5" aria-hidden /> Report this capsule
          </Button>
        </div>
      )}

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        postId={post.id}
        onDone={() => toast({ title: 'Report received', description: 'A moderator will review it shortly.' })}
      />
    </div>
  )
}

function ReportDialog({
  open, onOpenChange, postId, onDone,
}: { open: boolean; onOpenChange: (o: boolean) => void; postId: string; onDone: () => void }) {
  const [reason, setReason] = useState('INAPPROPRIATE')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await api(`/api/posts/${postId}/report`, { method: 'POST', json: { reason, details } })
      onDone()
      onOpenChange(false)
      setDetails('')
    } catch (e) {
      toast({ title: 'Report failed', description: e instanceof Error ? e.message : 'Try again.', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Report this capsule</DialogTitle>
          <DialogDescription>
            Tell a moderator what feels wrong. Reports are confidential.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={reason} onValueChange={setReason} className="gap-2">
          {REPORT_REASONS.map((r) => (
            <label key={r.value} className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm hover:bg-secondary/50">
              <RadioGroupItem value={r.value} id={`report-${r.value}`} />
              {r.label}
            </label>
          ))}
        </RadioGroup>
        <div className="space-y-2">
          <Label htmlFor="report-details">Details (optional)</Label>
          <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={1000} placeholder="Anything that helps the moderator understand." />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />} Send report
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
